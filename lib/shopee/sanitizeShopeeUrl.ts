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
// accidentally caught by the slug pattern. Only the slug pattern captures
// a slug group — the rest have empty slug.
const PRODUCT_ID_PATTERNS: { re: RegExp; slugIndex?: number }[] = [
  { re: /^\/product\/(\d+)\/(\d+)\/?$/ },
  { re: /^\/opaanlp\/(\d+)\/(\d+)\/?$/ },
  { re: /^\/universal-link\/product\/(\d+)\/(\d+)\/?$/ },
  // /{slug}-i.{shop}.{item} or /{slug}-i.{shop}.{item}.{tab}
  { re: /^\/([^/]+)-i\.(\d+)\.(\d+)(?:\.\d+)?\/?$/, slugIndex: 1 },
]

// Shopee runs one host per market. `www.` prefix is tolerated.
const SHOPEE_HOST =
  /^(www\.)?shopee\.(vn|co\.id|co\.th|com\.my|ph|sg|tw|com\.br|com\.mx|cl|com\.co)$/i

export type SanitizeResult =
  | {
      ok: true
      cleanUrl: string
      shopId: string
      itemId: string
      tld: string
      // Human-readable product name derived from the URL slug when the
      // input was in `/{slug}-i.{shop}.{item}` form. Best-effort; empty
      // for /product/{shop}/{item} inputs (no slug in path).
      productName?: string
    }
  | { ok: false; reason: 'INVALID_URL' | 'NOT_SHOPEE' | 'NOT_PRODUCT_URL' }

// Decode `%C3%81o-thun-nam-cao-cap` → `Áo thun nam cao cấp`.
function humanizeSlug(rawSlug: string): string | undefined {
  try {
    const decoded = decodeURIComponent(rawSlug)
    const humanized = decoded.replace(/-/g, ' ').trim()
    return humanized || undefined
  } catch {
    return undefined
  }
}

export function sanitizeShopeeUrl(input: string): SanitizeResult {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return { ok: false, reason: 'INVALID_URL' }
  }

  const host = url.hostname.toLowerCase()
  if (!SHOPEE_HOST.test(host)) return { ok: false, reason: 'NOT_SHOPEE' }

  for (const { re, slugIndex } of PRODUCT_ID_PATTERNS) {
    const m = url.pathname.match(re)
    if (m) {
      // For patterns with a slug capture group, shop/item are at slug+1/slug+2.
      // For others, they're at 1/2.
      const base = slugIndex ? slugIndex + 1 : 1
      const shopId = m[base]
      const itemId = m[base + 1]
      const tld = host.replace(/^www\./, '').replace(/^shopee\./, '')
      const productName = slugIndex ? humanizeSlug(m[slugIndex]) : undefined
      return {
        ok: true,
        shopId,
        itemId,
        tld,
        productName,
        // Canonical form — no query, no hash, no tracking. This is what
        // Shopee's an_redir attribution engine actually credits.
        cleanUrl: `https://shopee.${tld}/product/${shopId}/${itemId}`,
      }
    }
  }
  return { ok: false, reason: 'NOT_PRODUCT_URL' }
}
