// Fallback for URLs whose pathname doesn't match any of the 5 known Shopee
// product patterns: fetch the page HTML and read the canonical link that
// Shopee's server-side renderer emits (`<link rel="canonical" href="...">`
// or `<meta property="og:url" content="...">`). If either points at a
// product URL, we can feed it back through sanitizeShopeeUrl.
//
// Kept intentionally lightweight — no cheerio, no jsdom. Shopee's product
// HTML always ships the canonical <link> in the initial server response
// (not lazy-loaded after hydration), so a plain regex over the first ~100KB
// is enough.

const FETCH_TIMEOUT_MS = 6_000
const MAX_BODY_BYTES = 200_000 // Shopee HTML is ~600KB; head is enough for <head>

const CANONICAL_RE = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i
const OG_URL_RE = /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i

export async function fetchCanonicalUrl(pageUrl: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(pageUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Shopee 403s on default Node UA. Impersonate a real browser.
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok || !res.body) return null

    // Stream the first MAX_BODY_BYTES of the response so we don't buffer the
    // whole 600KB SPA payload just to read a link tag in <head>.
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let html = ''
    let total = 0
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      html += decoder.decode(value, { stream: true })
      // Early exit once we've likely captured the <head>
      if (html.includes('</head>')) break
    }
    reader.cancel().catch(() => {})

    const canonical = html.match(CANONICAL_RE)?.[1] || html.match(OG_URL_RE)?.[1]
    return canonical || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
