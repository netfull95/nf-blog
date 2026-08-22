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

// Public affiliate publisher ID. Not a secret — every shortlink the tool emits
// embeds this in the URL anyway. Hardcoded so the tool keeps working across
// environments without per-deploy env setup.
const SHOPEE_AFFILIATE_ID = '17323120332'

export type BuildError = { kind: 'EMPTY' }

export type BuildResult =
  | { ok: true; affiliateLink: string; originalLink: string }
  | { ok: false; error: BuildError }

// subIds: up to 5 free-form tracking values, joined with '-'. Empty values
// are preserved as empty slots so users can target a specific position
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

  const params = new URLSearchParams({
    origin_link: url,
    affiliate_id: SHOPEE_AFFILIATE_ID,
  })

  // Trim trailing empty subIds so we don't emit "...-...-...-" tails for
  // users who only set the first slot.
  const trimmed = [...subIds]
  while (trimmed.length > 0 && !trimmed[trimmed.length - 1]) trimmed.pop()
  if (trimmed.length > 0) {
    params.set('sub_id', trimmed.slice(0, 5).join('-'))
  }

  return {
    ok: true,
    affiliateLink: `https://s.shopee.${tld}/an_redir?${params.toString()}`,
    originalLink: url,
  }
}
