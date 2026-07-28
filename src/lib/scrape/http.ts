/**
 * Polite HTTP for the scrapers: a per-host token bucket, a real browser
 * User-Agent, bounded retries, and a circuit breaker so one blocked retailer
 * cannot stall every request behind it.
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const REQUEST_TIMEOUT_MS = 12_000
const MAX_RETRIES = 2
/** Minimum spacing between requests to the same host. */
const MIN_INTERVAL_MS = 2_000
/**
 * Hosts that need a gentler cadence than the default.
 *
 * Amazon tolerates a burst and then starts answering with a ~2 KB stub page for
 * everything, including queries it served a minute earlier. Backing off after
 * being blocked is too late — by then a whole bulk run has recorded false
 * misses — so it gets a wider interval up front.
 */
const HOST_INTERVAL_MS: Record<string, number> = {
  'www.amazon.com': 6_000,
}
/** Consecutive failures before a host is skipped entirely. */
const BREAKER_THRESHOLD = 4
const BREAKER_COOLDOWN_MS = 5 * 60_000

interface HostState {
  nextAllowedAt: number
  consecutiveFailures: number
  breakerUntil: number
}

const hosts = new Map<string, HostState>()

function stateFor(host: string): HostState {
  let s = hosts.get(host)
  if (!s) {
    s = { nextAllowedAt: 0, consecutiveFailures: 0, breakerUntil: 0 }
    hosts.set(host, s)
  }
  return s
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class ScrapeError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'ScrapeError'
  }
}

/** Serialise same-host requests so the spacing below is actually observed. */
const hostQueues = new Map<string, Promise<unknown>>()

function enqueue<T>(host: string, task: () => Promise<T>): Promise<T> {
  const prev = hostQueues.get(host) ?? Promise.resolve()
  const next = prev.then(task, task)
  // Keep the chain alive but don't retain rejections.
  hostQueues.set(
    host,
    next.catch(() => undefined),
  )
  return next
}

export async function fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
  const host = new URL(url).host
  return enqueue(host, async () => {
    const state = stateFor(host)

    if (Date.now() < state.breakerUntil) {
      throw new ScrapeError(`${host} is in cooldown after repeated failures`, false)
    }

    const wait = state.nextAllowedAt - Date.now()
    if (wait > 0) await sleep(wait)
    // Jitter so parallel workers don't align into a burst.
    const interval = HOST_INTERVAL_MS[host] ?? MIN_INTERVAL_MS
    state.nextAllowedAt = Date.now() + interval + Math.random() * 500

    let lastError: unknown
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new ScrapeError('aborted', false)
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      const composite = signal ? AbortSignal.any([signal, timeout]) : timeout

      try {
        const res = await fetch(url, {
          signal: composite,
          redirect: 'follow',
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'no-cache',
          },
        })

        if (res.status === 429 || res.status >= 500) {
          throw new ScrapeError(`${host} returned ${res.status}`, true)
        }
        if (!res.ok) {
          throw new ScrapeError(`${host} returned ${res.status}`, false)
        }

        const html = await res.text()
        if (html.length < 1000) {
          throw new ScrapeError(`${host} returned a suspiciously short body`, true)
        }

        state.consecutiveFailures = 0
        return html
      } catch (err) {
        lastError = err
        const retryable = !(err instanceof ScrapeError) || err.retryable
        if (!retryable || attempt === MAX_RETRIES) break
        await sleep(2 ** attempt * 1000 + Math.random() * 400)
      }
    }

    state.consecutiveFailures += 1
    if (state.consecutiveFailures >= BREAKER_THRESHOLD) {
      state.breakerUntil = Date.now() + BREAKER_COOLDOWN_MS
      state.consecutiveFailures = 0
    }
    throw lastError instanceof Error ? lastError : new ScrapeError(String(lastError), false)
  })
}

/** Exposed for the seed script's summary output. */
export function hostHealth(): { host: string; failures: number; inCooldown: boolean }[] {
  return [...hosts.entries()].map(([host, s]) => ({
    host,
    failures: s.consecutiveFailures,
    inCooldown: Date.now() < s.breakerUntil,
  }))
}
