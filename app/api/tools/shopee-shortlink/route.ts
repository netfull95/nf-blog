import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { buildAffiliateLink } from '@/lib/shopee/buildAffiliateLink'
import { expandShortlink, isShortlinkHost } from '@/lib/shopee/expandShortlink'
import { sanitizeShopeeUrl, type SanitizeResult } from '@/lib/shopee/sanitizeShopeeUrl'
import { fetchCanonicalUrl } from '@/lib/shopee/fetchCanonicalUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 60_000

// Two-stage sanitization: try regex on the URL we have; if it doesn't match
// any known Shopee product pattern, fetch the page and read the canonical
// link Shopee itself emits, then re-run the regex. The fallback fetch adds
// ~1-2s but only triggers for exotic URL shapes (mobile deep links, share
// sheets, etc.).
async function sanitizeWithFallback(input: string): Promise<SanitizeResult> {
  const first = sanitizeShopeeUrl(input)
  if (first.ok || first.reason !== 'NOT_PRODUCT_URL') return first

  const canonical = await fetchCanonicalUrl(input)
  if (!canonical) return first
  return sanitizeShopeeUrl(canonical)
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = checkRateLimit(`shopee:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
  if (!rl.ok) {
    const retryAfterSec = Math.max(1, Math.ceil(rl.retryAfterMs / 1000))
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
        },
      }
    )
  }

  const body = (await request.json().catch(() => null)) as
    | { url?: string; subIds?: string[] }
    | null
  let originUrl = (body?.url ?? '').trim()
  if (!originUrl) return NextResponse.json({ error: 'EMPTY' }, { status: 400 })

  // Step 1: if this is a Shopee shortlink (s.shopee.vn/xxx, shp.ee/xxx…),
  // follow the redirect chain to get the full destination URL. Sanitization
  // happens on the expanded URL, not the shortlink itself.
  let expandedFrom: string | undefined
  try {
    const parsed = new URL(originUrl)
    if (isShortlinkHost(parsed.hostname)) {
      const expanded = await expandShortlink(originUrl)
      if (!expanded) return NextResponse.json({ error: 'EXPAND_FAILED' }, { status: 502 })
      expandedFrom = originUrl
      originUrl = expanded
    }
  } catch {
    // Not a URL — fall through, sanitize will reject with INVALID_URL.
  }

  // Step 2: strip tracking params, extract shop_id/item_id, rebuild the
  // canonical `/product/{shop}/{item}` URL that Shopee's an_redir engine
  // credits for commission. Falls back to HTML canonical fetch on exotic
  // URL shapes.
  const sanitized = await sanitizeWithFallback(originUrl)
  if (!sanitized.ok) {
    const status = sanitized.reason === 'NOT_SHOPEE' ? 400 : 400
    return NextResponse.json({ error: sanitized.reason }, { status })
  }

  // Step 3: build the an_redir link with the CLEAN canonical URL.
  const result = buildAffiliateLink(sanitized.cleanUrl, body?.subIds ?? [])
  if (!result.ok) {
    return NextResponse.json({ error: result.error.kind }, { status: 400 })
  }

  return NextResponse.json(
    {
      shortLink: result.affiliateLink,
      longLink: result.originalLink,
      shopId: sanitized.shopId,
      itemId: sanitized.itemId,
      ...(sanitized.productName ? { productName: sanitized.productName } : {}),
    },
    {
      headers: {
        'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
        'X-RateLimit-Remaining': String(rl.remaining),
        'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
      },
    }
  )
}
