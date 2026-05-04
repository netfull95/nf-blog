// Build a Shopee affiliate redirect URL using Shopee's documented public
// template (no auth, no session, no upstream call required):
//
//   https://s.shopee.vn/an_redir?origin_link=<encoded>&affiliate_id=<id>&sub_id=<subIds>
//
// Source: https://help.shopee.vn/portal/10/article/172955
//
// The output URL is itself the "shortlink" for affiliate tracking purposes —
// the s.shopee.vn host handles redirect + commission attribution. Users may
// further shorten it via bit.ly etc. if desired.

const SHOPEE_HOSTS = ['shopee.vn', 'shp.ee', 'shope.ee']

// Public affiliate publisher ID. Not a secret — every shortlink the tool emits
// embeds this in the URL anyway. Hardcoded so the tool keeps working across
// environments without per-deploy env setup.
const SHOPEE_AFFILIATE_ID = '17323120332'

export type BuildError =
  | { kind: 'NOT_SHOPEE' }
  | { kind: 'EMPTY' }

export type BuildResult =
  | { ok: true; affiliateLink: string; originalLink: string }
  | { ok: false; error: BuildError }

export function isShopeeUrl(input: string): boolean {
  try {
    const u = new URL(input)
    const host = u.hostname.toLowerCase()
    return SHOPEE_HOSTS.some((h) => host === h || host.endsWith('.' + h))
  } catch {
    return false
  }
}

// subIds: up to 5 free-form tracking values, joined with '-'. Empty values
// are preserved as empty slots so users can target a specific position
// (e.g. only sub_id #3) by passing ['', '', 'campaign-x', '', ''].
export function buildAffiliateLink(originalUrl: string, subIds: string[] = []): BuildResult {
  const url = originalUrl.trim()
  if (!url) return { ok: false, error: { kind: 'EMPTY' } }
  if (!isShopeeUrl(url)) return { ok: false, error: { kind: 'NOT_SHOPEE' } }

  // Users typically paste URLs straight from the browser address bar, which
  // are already %-encoded. URLSearchParams would double-encode them (%E1 →
  // %25E1) and break the redirect, so we decode first when possible.
  let decoded = url
  try {
    decoded = decodeURIComponent(url)
  } catch {
    // Malformed escapes — fall back to the raw input. Shopee will reject if
    // it's truly invalid, but at least we won't drop a legitimate edge case.
  }

  const params = new URLSearchParams({
    origin_link: decoded,
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
    affiliateLink: `https://s.shopee.vn/an_redir?${params.toString()}`,
    originalLink: url,
  }
}
