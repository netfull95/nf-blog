// Normalize any Shopee URL — full product URL, slug URL, affiliate landing,
// or a URL with tracking params like `xptdk` / `sp_atk` / `utm_*` — down to
// a clean canonical product URL: `https://shopee.<tld>/product/{shop}/{item}`.
//
// This matters because Shopee's an_redir affiliate template refuses to
// credit commission when `origin_link` carries tracking params or points
// at a non-product page. Docs (2026 rules):
//   https://data.addlivetag.com/shopee/aff-link.html
//   https://github.com/bcat95/shopee-aff  (bc-custom-link/link.php)

// Product ID lives in the pathname for every URL shape Shopee returns.
// Order matters — put more specific patterns first so `/opaanlp/…` isn't
// accidentally caught by the slug pattern.
const PRODUCT_ID_PATTERNS: RegExp[] = [
  /^\/product\/(\d+)\/(\d+)\/?$/,
  /^\/opaanlp\/(\d+)\/(\d+)\/?$/,
  /^\/universal-link\/product\/(\d+)\/(\d+)\/?$/,
  // /{slug}-i.{shop}.{item} or /{slug}-i.{shop}.{item}.{tab}
  /^\/[^/]+-i\.(\d+)\.(\d+)(?:\.\d+)?\/?$/,
]

// Shopee runs one host per market. `www.` prefix is tolerated.
const SHOPEE_HOST =
  /^(www\.)?shopee\.(vn|co\.id|co\.th|com\.my|ph|sg|tw|com\.br|com\.mx|cl|com\.co)$/i

export type SanitizeResult =
  | { ok: true; cleanUrl: string; shopId: string; itemId: string; tld: string }
  | { ok: false; reason: 'INVALID_URL' | 'NOT_SHOPEE' | 'NOT_PRODUCT_URL' }

export function sanitizeShopeeUrl(input: string): SanitizeResult {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return { ok: false, reason: 'INVALID_URL' }
  }

  const host = url.hostname.toLowerCase()
  if (!SHOPEE_HOST.test(host)) return { ok: false, reason: 'NOT_SHOPEE' }

  for (const pattern of PRODUCT_ID_PATTERNS) {
    const m = url.pathname.match(pattern)
    if (m) {
      const shopId = m[1]
      const itemId = m[2]
      const tld = host.replace(/^www\./, '').replace(/^shopee\./, '')
      return {
        ok: true,
        shopId,
        itemId,
        tld,
        // Canonical form — no query, no hash, no tracking. This is what
        // Shopee's an_redir attribution engine actually credits.
        cleanUrl: `https://shopee.${tld}/product/${shopId}/${itemId}`,
      }
    }
  }
  return { ok: false, reason: 'NOT_PRODUCT_URL' }
}
