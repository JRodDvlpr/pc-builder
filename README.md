# PC Builder

A PC part picker that checks compatibility **before** you click, keeps a live power
budget on screen, and pulls current prices off the web.

```bash
npm install
npm run dev          # http://localhost:3000
```

No API keys, no database server, no signup. It works offline too — the parts catalog
and every compatibility rule are local, so only prices need the network.

---

## What it does differently

**Incompatible parts hide themselves.** Every row in the picker is evaluated against
the build you already have. Parts that cannot work are hidden by default; turn the
filter off and they appear dimmed with the specific reason on hover — "358 mm card in
a case rated for 322 mm" — so you learn why before you commit, not after.

**The power budget is a first-class number.** A gauge tracks estimated draw against
your PSU's rating with an 80% marker, because a supply that is adequate on paper still
trips over-current protection on GPU transients. Component-by-component breakdown on
hover.

**Every issue names both parts and offers to swap either one.** No hunting for which
of your ten components the warning is about.

**Nothing reloads.** Picking a part is an inline panel, filtering is client-side over
an in-memory catalog, and prices stream into the table per row rather than blocking it.

---

## How prices work

Specs are committed data; prices are scraped data. That split is the core design
decision — it means a scraper outage costs you a price badge, never a broken page.

- **Newegg** and **Amazon** search pages are parsed server-side (CORS makes this
  impossible from the browser).
- Results are cached in SQLite. Reads are always instant: the API answers from cache
  and schedules a refresh in the background, so nothing you do waits on a retailer.
- Freshness is visible per row — a green dot for live (< 6 h), amber for cached, grey
  for the committed reference price.
- **Matching is deliberately strict.** A confident wrong price silently corrupts your
  total, so listings must clear a high bar: exact part-number hits win outright, every
  model number must match as a whole token, and accessories, bundles and refurbished
  stock are rejected. When nothing is convincing the part shows its reference price and
  says so, rather than guessing.

Prices for DDR5 and NVMe currently scrape well above the committed reference figures.
That is the live market, not a bug — which is rather the point of scraping.

```bash
npm run seed:prices              # scrape ~20 parts, report the match rate
npm run seed:prices -- --all     # the whole catalog (slow; be polite)
npm run refresh:prices           # top up anything stale
```

`seed:prices` is the canary for the price layer. If a retailer changes its markup the
match rate collapses and the script exits non-zero.

---

## Compatibility rules

Pure functions in `src/lib/compat/rules.ts` — no React, no I/O, fully unit-tested.
Three severities: **error** (won't assemble or won't post), **warning** (works but
compromised), **info** (worth knowing).

Covered: CPU↔socket, chipset↔CPU generation (including the BIOS-flash caveat), memory
type/slots/capacity/speed, motherboard↔case form factor, GPU length, cooler height and
socket brackets, radiator mounts, cooler capacity vs CPU package power, RAM height vs
cooler clearance, PSU wattage and headroom, PCIe and EPS connectors, PSU form factor
and length, M.2 and SATA port counts, drive bays, and missing display output.

Power estimation lives in `src/lib/compat/power.ts`. Monitors are excluded — they draw
from the wall, not the PSU.

---

## Testing

```bash
npm run test        # unit tests: compatibility rules + listing matcher
npm run test:e2e    # Playwright: builds a full PC, forces a conflict, shares a link
```

The matcher tests use real listing titles captured from live searches, including the
ones that were matched *wrongly* during development — a 3-pack sold as a 5-pack, a CPU
+ motherboard bundle priced as a bare CPU. Those are regression tests.

The e2e suite runs against a production build with scraping disabled, so it is
deterministic and works offline.

> Playwright uses the Chromium already on the machine. Set `PLAYWRIGHT_CHROMIUM_PATH`
> if yours lives somewhere other than the default in `playwright.config.ts`, or remove
> `launchOptions` to let Playwright manage its own download.

---

## Layout

```
data/catalog/*.json     469 parts across 10 categories, with the specs rules need
src/lib/catalog/        types, platform/chipset map, filter facets, spec columns
src/lib/compat/         rules, engine, power estimator
src/lib/scrape/         provider adapters, matcher, HTTP politeness, cache policy
src/lib/db/             SQLite: offers, price history, saved builds
src/lib/build/          selection state, URL encoding, totals
src/components/         builder table, part picker, wattage meter, issue list
```

Builds encode into a single `?b=` parameter (`?b=cpu-9800x3d,mb-b850-tomahawk,…`).
Category is derived from each part id, so the link stays short and the two can never
disagree.

---

## Adding parts

Append to the relevant file in `data/catalog/` and give it a real `mpn` — that is the
scraper's most precise search key. Filter facets and spec columns derive themselves
from whatever the catalog contains, so nothing else needs updating.

Chipset support lives in `src/lib/catalog/platforms.ts`; a new chipset needs an entry
there for the CPU-generation rule to reason about it.

---

## Known limits

- Prices are US retail from two sources. Walmart, Best Buy, eBay, Micro Center and
  B&H all block automated access, so they are not included.
- The catalog is curated rather than exhaustive; it covers current mainstream parts,
  not every SKU ever sold.
- `.data/prices.db` is local and gitignored — a fresh clone starts with reference
  prices and fills in as you browse.
