import { describe, expect, it, vi } from 'vitest'

/**
 * Provider parsing, pinned against the markup the retailers actually serve.
 *
 * The fixtures below are trimmed from live Amazon search HTML captured during
 * development — attribute names and class names are verbatim, because those are
 * exactly what silently rots when a retailer restyles its results page.
 */

vi.mock('@/lib/scrape/http', async (importOriginal) => ({
  // Only the network call is faked; ScrapeError and its retryable flag are real,
  // since the point of the throttle test is that a genuine retryable error is
  // raised rather than an empty result.
  ...(await importOriginal<typeof import('@/lib/scrape/http')>()),
  fetchHtml: vi.fn(async () => fixture),
}))

let fixture = ''

const { amazon } = await import('@/lib/scrape/providers/amazon')

function card({ asin, headings, price }: { asin: string; headings: string[]; price: string }) {
  return `
    <div data-component-type="s-search-result" data-asin="${asin}">
      ${headings.map((h, i) => `<h2 class="${i === 0 && headings.length > 1 ? 'a-size-mini s-line-clamp-1' : 'a-size-medium'}">${h}</h2>`).join('')}
      <img class="s-image" alt="${headings.join(' ')}" src="https://m.media-amazon.com/images/I/${asin}.jpg" />
      <div class="a-price"><span class="a-price-whole">${price.split('.')[0]}</span><span class="a-price-fraction">${price.split('.')[1]}</span></div>
    </div>`
}

describe('amazon search results', () => {
  it('rejoins a card that splits the brand out of the product name', async () => {
    // Regression: Amazon moved to a two-heading card where the product line drops
    // the brand. Reading the first heading gave the bare string "Corsair", which
    // matched nothing — every card of this shape lost its price and its image.
    fixture = card({
      asin: 'B0CQMJN49P',
      headings: ['Corsair', 'CX750 80 Plus Bronze Non Modular Low-Noise ATX 750 Watt Power Supply - NA - Black'],
      price: '82.79',
    })

    const [listing] = await amazon.search('Corsair CX750')
    expect(listing.title).toBe(
      'Corsair CX750 80 Plus Bronze Non Modular Low-Noise ATX 750 Watt Power Supply - NA - Black',
    )
    expect(listing.price).toBe(82.79)
    expect(listing.image).toContain('media-amazon.com')
  })

  it('still reads the older single-heading card', async () => {
    fixture = card({
      asin: 'B0GCKB29XN',
      headings: ['Corsair RM750e (2023) Fully Modular Low-Noise Power Supply - ATX 3.1 & PCIe 5.1 Compliant'],
      price: '68.99',
    })

    const [listing] = await amazon.search('Corsair RM750e')
    expect(listing.title).toMatch(/^Corsair RM750e \(2023\)/)
    expect(listing.price).toBe(68.99)
  })

  it('falls back to the thumbnail alt text when no heading is recognisable', async () => {
    fixture = `
      <div data-component-type="s-search-result" data-asin="B0TEST0001">
        <img class="s-image" alt="Corsair HX1500i Fully Modular ATX Power Supply" src="https://m.media-amazon.com/images/I/x.jpg" />
        <div class="a-price"><span class="a-offscreen">$239.99</span></div>
      </div>`

    const [listing] = await amazon.search('Corsair HX1500i')
    expect(listing.title).toBe('Corsair HX1500i Fully Modular ATX Power Supply')
    expect(listing.price).toBe(239.99)
  })

  it('treats a page with no result cards as a block, not an empty result', async () => {
    /*
     * Amazon answers a throttled request with HTTP 200 and a ~2 KB stub, which
     * clears the transport layer's short-body check. Returning [] recorded that
     * as "searched, no match" — a false negative that then suppressed retries
     * for a day and made an audit conclude Amazon stocked no CPUs at all.
     */
    fixture = `<html><body><div class="s-no-outline">${'x'.repeat(2000)}</div></body></html>`

    await expect(amazon.search('AMD Ryzen 9 9950X3D')).rejects.toThrow(/throttled/i)
  })

  it('skips a card with no usable price rather than inventing one', async () => {
    fixture = `
      <div data-component-type="s-search-result" data-asin="B0TEST0002">
        <h2>Corsair CX750 Power Supply</h2>
      </div>`

    expect(await amazon.search('Corsair CX750')).toEqual([])
  })
})
