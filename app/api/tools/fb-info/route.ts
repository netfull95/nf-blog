import { NextRequest, NextResponse } from 'next/server'
import { parseFbUrl, type FbUrlInfo } from '@/lib/fb/parseFbUrl'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FETCH_TIMEOUT_MS = 8000
const GRAPH_TIMEOUT_MS = 5000
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 30_000
const GRAPH_API_VERSION = 'v19.0'

type FbInfoResponse = {
  username?: string
  // FB exposes a "page-as-actor" ID via OG/HTML scrape — we surface this as
  // actorId. Distinct from the page entity ID returned by the Graph API.
  actorId?: string
  // True page entity ID, only obtainable via Graph API.
  pageId?: string
  canonicalUrl: string
  kind: FbUrlInfo['kind']
  // OG-derived metadata.
  name?: string
  description?: string
  profileImage?: string
  ogType?: string
  // Graph-derived metadata (only populated when FB_GRAPH_TOKEN is set).
  category?: string
  about?: string
  fanCount?: number
  // Telemetry / capability flags.
  graphEnabled: boolean
  blocked?: boolean
  fetchError?: string
}

type GraphPage = {
  id?: string
  name?: string
  username?: string
  about?: string
  category?: string
  fan_count?: number
  link?: string
  picture?: { data?: { url?: string } }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function metaContent(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return decodeHtmlEntities(m[1])
  }
  return undefined
}

function extractActorId(html: string): string | undefined {
  // FB embeds the actor (page-as-user) ID in many places.
  const patterns: RegExp[] = [
    /"userID":"(\d{6,})"/,
    /"profile_owner":"(\d{6,})"/,
    /"profile_id":"(\d{6,})"/,
    /"page_id":"(\d{6,})"/,
    /"entity_id":"(\d{6,})"/,
    /content="fb:\/\/profile\/(\d+)"/i,
    /content="fb:\/\/page\/\?id=(\d+)"/i,
    /\\"userID\\":\\"(\d{6,})\\"/,
    /"user":\{"id":"(\d{6,})"/,
    /"actorID":"(\d{6,})"/,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return m[1]
  }
  const ogUrl = metaContent(html, 'og:url')
  if (ogUrl) {
    try {
      const u = new URL(ogUrl)
      const id = u.searchParams.get('id')
      if (id && /^\d+$/.test(id)) return id
    } catch {
      /* ignore */
    }
  }
  return undefined
}

function looksLikeLoginWall(html: string): boolean {
  const indicators = ['Log into Facebook', 'login_form', 'You must log in to continue']
  const hasOg = /property=["']og:title["']/.test(html)
  return !hasOg && indicators.some((s) => html.includes(s))
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) throw new Error(`HTTP_${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

// Resolves vanity username OR numeric id via Graph API. Returns null on any
// failure so callers can fall back gracefully.
async function enrichFromGraph(idOrUsername: string): Promise<GraphPage | null> {
  const token = process.env.FB_GRAPH_TOKEN
  if (!token || !idOrUsername) return null

  const fields = ['id', 'name', 'username', 'about', 'category', 'fan_count', 'link', 'picture.type(large)'].join(',')
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(
    idOrUsername
  )}?fields=${fields}&access_token=${encodeURIComponent(token)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const json = (await res.json()) as GraphPage & { error?: unknown }
    if (json.error) return null
    return json
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const rl = checkRateLimit(`fb-info:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
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

  const url = request.nextUrl.searchParams.get('url')?.trim()
  if (!url) {
    return NextResponse.json({ error: 'EMPTY' }, { status: 400 })
  }

  let parsed: FbUrlInfo
  try {
    parsed = parseFbUrl(url)
  } catch (e) {
    const code = e instanceof Error ? e.message : 'INVALID_URL'
    return NextResponse.json({ error: code }, { status: 400 })
  }

  const graphEnabled = Boolean(process.env.FB_GRAPH_TOKEN)
  const result: FbInfoResponse = {
    username: parsed.username,
    actorId: parsed.numericId,
    canonicalUrl: parsed.canonical,
    kind: parsed.kind,
    graphEnabled,
  }

  // Run OG scrape and Graph enrichment concurrently. Either may fail.
  const lookupKey = parsed.username || parsed.numericId || ''
  const [htmlResult, graphResult] = await Promise.allSettled([
    fetchHtml(parsed.canonical),
    enrichFromGraph(lookupKey),
  ])

  // OG scrape
  if (htmlResult.status === 'fulfilled') {
    const html = htmlResult.value
    if (looksLikeLoginWall(html)) {
      result.blocked = true
    } else {
      result.name = metaContent(html, 'og:title')
      result.description = metaContent(html, 'og:description')
      result.profileImage = metaContent(html, 'og:image')
      result.ogType = metaContent(html, 'og:type')
      if (!result.actorId) result.actorId = extractActorId(html)
      if (!result.name && !result.actorId && !result.profileImage) {
        result.blocked = true
      }
    }
  } else {
    result.fetchError =
      htmlResult.reason instanceof Error ? htmlResult.reason.message : 'FETCH_FAILED'
  }

  // Graph enrichment — only sets fields when we actually got data.
  if (graphResult.status === 'fulfilled' && graphResult.value) {
    const g = graphResult.value
    if (g.id) result.pageId = g.id
    if (g.name && !result.name) result.name = g.name
    if (g.username && !result.username) result.username = g.username
    if (g.category) result.category = g.category
    if (g.about) result.about = g.about
    if (typeof g.fan_count === 'number') result.fanCount = g.fan_count
    if (g.picture?.data?.url && !result.profileImage) result.profileImage = g.picture.data.url
    if (g.link) result.canonicalUrl = g.link
  }

  return NextResponse.json(result, {
    headers: {
      'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
      'X-RateLimit-Remaining': String(rl.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rl.resetAt / 1000)),
    },
  })
}
