// Build a Shopee affiliate redirect URL using Shopee's documented public
// template (no auth, no session, no upstream call required):
//
//   https://s.shopee.<tld>/an_redir?origin_link=<encoded>&affiliate_id=<id>&sub_id=<subIds>
//
// Source: https://help.shopee.vn/portal/10/article/172955
//         https://data.addlivetag.com/shopee/aff-link.html  (2026 rules)
//
// Input contract: `originalUrl` MUST already be a CLEAN canonical product URL
// (no `xptdk`, `sp_atk`, `utm_*`, `gads_*` params, and pointing at a real
// product page — not a shop / category / search). Callers should run the
// URL through `sanitizeShopeeUrl()` first; passing a dirty URL here breaks
// attribution and Shopee will silently drop the commission.
//
// This module is client-safe (no server-only imports) so both the API route
// and the Deals board client component can import it.

// Public affiliate publisher ID. Not a secret — every shortlink the tool emits
// embeds this in the URL anyway. Hardcoded so the tool keeps working across
// environments without per-deploy env setup. Single source of truth — change
// here to rotate the affiliate ID everywhere.
export const SHOPEE_AFFILIATE_ID = '17323120332'

export type BuildError = { kind: 'EMPTY' }

export type BuildResult =
  | { ok: true; affiliateLink: string; originalLink: string }
  | { ok: false; error: BuildError }

// Internal — actually assembles the an_redir URL. Callers should reach it
// through `buildAffiliateLink` (URL string in) or `buildAffiliateLinkFromIds`
// (shopId + itemId in).
function assembleAnRedir(cleanUrl: string, tld: string, subIds: string[]): string {
  const params = new URLSearchParams({
    origin_link: cleanUrl,
    affiliate_id: SHOPEE_AFFILIATE_ID,
  })
  // Trim trailing empty subIds so we don't emit "...-...-...-" tails for
  // callers who only set the first slot.
  const trimmed = [...subIds]
  while (trimmed.length > 0 && !trimmed[trimmed.length - 1]) trimmed.pop()
  if (trimmed.length > 0) {
    params.set('sub_id', trimmed.slice(0, 5).join('-'))
  }
  return `https://s.shopee.${tld}/an_redir?${params.toString()}`
}

// subIds: up to 5 free-form tracking values, joined with '-'. Empty values
// are preserved as empty slots so callers can target a specific position
// (e.g. only sub_id #3) by passing ['', '', 'campaign-x', '', ''].
export function buildAffiliateLink(cleanUrl: string, subIds: string[] = []): BuildResult {
  const url = cleanUrl.trim()
  if (!url) return { ok: false, error: { kind: 'EMPTY' } }

  // Extract TLD from the clean product URL so the affiliate host matches the
  // market (VN → s.shopee.vn, ID → s.shopee.co.id, etc.).
  let tld = 'vn'
  try {
    const host = new URL(url).hostname.toLowerCase()
    const m = host.match(/^(?:www\.)?shopee\.(.+)$/)
    if (m) tld = m[1]
  } catch {
    // Unreachable if the URL came from sanitizeShopeeUrl, but be defensive.
  }

  return {
    ok: true,
    affiliateLink: assembleAnRedir(url, tld, subIds),
    originalLink: url,
  }
}

// Alternative entry point when the caller already has shopId + itemId (e.g.
// from a Deals API response) and doesn't need URL sanitization — always
// returns a valid an_redir string, no error variant.
export function buildAffiliateLinkFromIds(
  shopId: number | string,
  itemId: number | string,
  subIds: string[] = [],
  tld = 'vn'
): string {
  const cleanUrl = `https://shopee.${tld}/product/${shopId}/${itemId}`
  return assembleAnRedir(cleanUrl, tld, subIds)
}
