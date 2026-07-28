import * as cheerio from 'cheerio'

import { ScrapeError, fetchHtml } from '../http'
import type { PriceProvider, RawListing } from '../types'

/**
 * Amazon search results.
 *
 * Prices are split across `.a-price-whole` and `.a-price-fraction`; the
 * `.a-offscreen` span holds the same value as plain text and is used as a
 * fallback when the split spans are missing. Sponsored rows are kept — they are
 * still real listings for the product — but the matcher decides whether the row
 * is actually the part we asked for.
 */

/**
 * The product name, reassembled from however the card happens to be laid out.
 *
 * Amazon renders two shapes of result card. The older one puts the whole name in
 * a single `h2`. The newer one splits it in two — a brand line ("Corsair") and a
 * product line that *omits* the brand ("CX750 80 Plus Bronze …") — so reading
 * only the first `h2` yields the bare brand, which matches nothing and silently
 * cost us a price on every card of that shape. Joining every heading handles both
 * without having to detect which one we got.
 */
function cardTitle($: cheerio.CheerioAPI, item: cheerio.Cheerio<never>): string {
  const headings = $(item)
    .find('h2')
    .map((_, h) => $(h).text().trim())
    .get()
    .filter(Boolean)
  if (headings.length > 0) return headings.join(' ')
  // Layouts change; the thumbnail's alt text is the full name too, so it is a
  // useful backstop when no heading is recognisable at all.
  return $(item).find('img.s-image').first().attr('alt')?.trim() ?? ''
}
export const amazon: PriceProvider = {
  id: 'amazon',

  async search(query, signal) {
    const url = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`
    const html = await fetchHtml(url, signal)
    const $ = cheerio.load(html)
    const cards = $('[data-component-type="s-search-result"]')

    /**
     * A results page with no result cards means we were blocked, not that the
     * product does not exist.
     *
     * Amazon answers a throttled request with HTTP 200 and a ~2 KB stub — long
     * enough to clear the transport layer's short-body check, and structurally
     * indistinguishable from an honest empty result. Returning `[]` recorded
     * that as "searched, no match", which is a lie that compounds: the miss
     * cool-off then suppressed retries for a day, and an audit of the cache
     * concluded Amazon simply did not stock 57 CPUs it stocks perfectly well.
     *
     * Raising a retryable error instead lets the backoff and circuit breaker do
     * their job and keeps the scrape log honest. We only ever search exact part
     * numbers or brand-and-model, so a genuinely empty page is rare enough that
     * treating it as a block is the safer default.
     */
    if (cards.length === 0) {
      throw new ScrapeError('amazon returned no result cards — likely throttled', true)
    }

    const listings: RawListing[] = []

    cards.each((_, el) => {
      const item = $(el)
      const title = cardTitle($, el as never)
      if (!title) return

      const priceBlock = item.find('.a-price').not('.a-text-price').first()
      let price = Number.NaN

      const whole = priceBlock.find('.a-price-whole').first().text().replace(/[^0-9]/g, '')
      const frac = priceBlock.find('.a-price-fraction').first().text().replace(/[^0-9]/g, '')
      if (whole) {
        price = Number.parseFloat(`${whole}.${frac || '00'}`)
      } else {
        const offscreen = priceBlock.find('.a-offscreen').first().text().replace(/[^0-9.]/g, '')
        price = Number.parseFloat(offscreen)
      }
      if (!Number.isFinite(price) || price <= 0) return

      const asin = item.attr('data-asin')
      const href = item.find('a.a-link-normal').first().attr('href') ?? ''
      const productUrl = asin
        ? `https://www.amazon.com/dp/${asin}`
        : href.startsWith('http')
          ? href
          : `https://www.amazon.com${href}`

      const availability = item.text().toLowerCase()
      const inStock = !availability.includes('currently unavailable')

      listings.push({
        title,
        price,
        url: productUrl,
        inStock,
        image: item.find('img.s-image').first().attr('src') ?? undefined,
      })
    })

    return listings
  },
}
