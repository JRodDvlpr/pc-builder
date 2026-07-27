import * as cheerio from 'cheerio'

import { fetchHtml } from '../http'
import type { PriceProvider, RawListing } from '../types'

/**
 * Newegg search results.
 *
 * Verified against the live markup: results are `.item-cell` blocks, the title
 * lives in `.item-title`, and the price is split across
 * `<li class="price-current">$<strong>549</strong><sup>.99</sup>`. There is no
 * JSON-LD on these pages, so the DOM is the only source.
 */
export const newegg: PriceProvider = {
  id: 'newegg',

  async search(query, signal) {
    const url = `https://www.newegg.com/p/pl?d=${encodeURIComponent(query)}`
    const html = await fetchHtml(url, signal)
    const $ = cheerio.load(html)
    const listings: RawListing[] = []

    $('.item-cell').each((_, el) => {
      const cell = $(el)
      const title = cell.find('.item-title').first().text().trim()
      if (!title) return

      const priceEl = cell.find('.price-current').first()
      const whole = priceEl.find('strong').first().text().replace(/[^0-9]/g, '')
      const frac = priceEl.find('sup').first().text().replace(/[^0-9]/g, '')
      if (!whole) return
      const price = Number.parseFloat(`${whole}.${frac || '00'}`)
      if (!Number.isFinite(price) || price <= 0) return

      const href = cell.find('a.item-title').first().attr('href') ?? ''
      const promo = cell.find('.item-promo').first().text().toLowerCase()
      const inStock = !promo.includes('out of stock')

      listings.push({
        title,
        price,
        url: href.startsWith('http') ? href : `https://www.newegg.com${href}`,
        inStock,
        image: cell.find('.item-img img').first().attr('src') ?? undefined,
      })
    })

    return listings
  },
}
