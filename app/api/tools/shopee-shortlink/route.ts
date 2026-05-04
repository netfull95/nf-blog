import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { buildAffiliateLink } from '@/lib/shopee/buildAffiliateLink'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 60_000

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
  const result = buildAffiliateLink(body?.url ?? '', body?.subIds ?? [])

  if (result.ok) {
    return NextResponse.json(
      { shortLink: result.affiliateLink, longLink: result.originalLink },
      {
        headers: {
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': String(rl.remaining),
          'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
        },
      }
    )
  }

  switch (result.error.kind) {
    case 'EMPTY':
      return NextResponse.json({ error: 'EMPTY' }, { status: 400 })
    case 'NOT_SHOPEE':
      return NextResponse.json({ error: 'NOT_SHOPEE' }, { status: 400 })
  }
}
