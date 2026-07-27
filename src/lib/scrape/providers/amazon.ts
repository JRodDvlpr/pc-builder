import * as cheerio from 'cheerio'

import { fetchHtml } from '../http'
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
export const amazon: PriceProvider = {
  id: 'amazon',

  async search(query, signal) {
    const url = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`
    const html = await fetchHtml(url, signal)
    const $ = cheerio.load(html)
    const listings: RawListing[] = []

    $('[data-component-type="s-search-result"]').each((_, el) => {
      const item = $(el)
      const title = item.find('h2').first().text().trim()
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
