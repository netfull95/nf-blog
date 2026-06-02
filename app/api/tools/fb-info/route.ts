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
  // Engagement signals parsed from OG description — usable for legit-checking
  // without needing a Graph token.
  talkingAbout?: number
  wereHere?: number
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
    // Bare fb:// URI without content= wrapper or ?id= query (catch-all from fb-id lib pattern).
    /fb:\/\/(?:page|profile)\/(\d{6,})/i,
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

// Parse engagement counts from FB's standard OG description format. FB returns
// localized strings (VN: "977.200 lượt thích · 152.565 người đang nói về điều này
// · 10 lượt đăng ký ở đây"; EN: "X likes · Y talking about this · Z were here").
// All three are public legit signals — page with high engagement + check-ins is
// statistically more trustworthy than a brand-new empty page.
function parseEngagementSignals(description?: string): {
  likes?: number
  talkingAbout?: number
  wereHere?: number
} {
  if (!description) return {}
  const parseNum = (s: string): number | undefined => {
    const cleaned = s.replace(/[.,\s]/g, '')
    const n = parseInt(cleaned, 10)
    return Number.isFinite(n) ? n : undefined
  }
  const likesMatch = description.match(/([\d.,\s]+)\s*(?:lượt thích|likes)/i)
  const talkingMatch = description.match(
    /([\d.,\s]+)\s*(?:người đang nói|talking about)/i
  )
  const wereHereMatch = description.match(/([\d.,\s]+)\s*(?:lượt đăng ký|were here)/i)
  return {
    likes: likesMatch ? parseNum(likesMatch[1]) : undefined,
    talkingAbout: talkingMatch ? parseNum(talkingMatch[1]) : undefined,
    wereHere: wereHereMatch ? parseNum(wereHereMatch[1]) : undefined,
  }
}

function looksLikeLoginWall(html: string): boolean {
  const indicators = ['Log into Facebook', 'login_form', 'You must log in to continue']
  const hasOg = /property=["']og:title["']/.test(html)
  return !hasOg && indicators.some((s) => html.includes(s))
}

const UA_FB_CRAWLER =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
const UA_DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchHtml(url: string, userAgent: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': userAgent,
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

// Try the facebookexternalhit UA first (returns minimal OG-rich HTML when it
// works), and fall back to a desktop Chrome UA if FB serves a login wall or
// strips the OG meta tags. The desktop UA is the trick the fb-id library uses
// and often unblocks pages where the crawler UA gets rate-limited.
async function fetchHtmlWithFallback(
  url: string
): Promise<{ html: string; uaUsed: 'crawler' | 'desktop'; blocked: boolean }> {
  const html = await fetchHtml(url, UA_FB_CRAWLER)
  const firstBlocked = looksLikeLoginWall(html)
  const firstHasOg = /property=["']og:title["']/.test(html)
  if (!firstBlocked && firstHasOg) {
    return { html, uaUsed: 'crawler', blocked: false }
  }
  try {
    const fallback = await fetchHtml(url, UA_DESKTOP_CHROME)
    if (!looksLikeLoginWall(fallback)) {
      return { html: fallback, uaUsed: 'desktop', blocked: false }
    }
  } catch {
    /* fall through with the original response */
  }
  return { html, uaUsed: 'crawler', blocked: firstBlocked }
}

type PluginInfo = {
  pageId: string
  pageName?: string
  coverPhotoUrl?: string
}

function decodeJsonUnicode(s: string): string {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

// Resolves the real page entity ID (different from the actor/user-mode ID
// exposed by the OG scrape) by hitting FB's Page Plugin embed endpoint. The
// plugin response works without auth and exposes the entity ID along with
// pageName and a cover photo URL — handy as fallback when the OG scrape
// times out on heavy pages.
async function fetchPluginInfo(canonicalUrl: string): Promise<PluginInfo | null> {
  const pluginUrl = `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(
    canonicalUrl
  )}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(pluginUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA_DESKTOP_CHROME,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return null
    const html = await res.text()
    // Normalize JSON-escaped slashes (`\/`) — FB sometimes returns the
    // embed_page link inside a JSON blob like
    //   "pageURL":"https:\/\/www.facebook.com\/111242880276829?ref=embed_page"
    // which the literal-`/` regex would miss.
    const normalized = html.replace(/\\\//g, '/')
    const idMatch = normalized.match(/facebook\.com\/(\d{6,})\?ref=embed_page/)
    if (!idMatch) return null

    const nameMatch = normalized.match(/"pageName":"([^"]+)"/)
    const coverMatch = normalized.match(/"coverPhotoURL":"([^"]+)"/)

    return {
      pageId: idMatch[1],
      pageName: nameMatch ? decodeJsonUnicode(nameMatch[1]) : undefined,
      coverPhotoUrl: coverMatch ? coverMatch[1] : undefined,
    }
  } catch {
    return null
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

  // Run OG scrape, plugin-embed page-id lookup, and Graph enrichment concurrently.
  // Any of these may fail independently.
  const lookupKey = parsed.username || parsed.numericId || ''
  const [htmlResult, pluginResult, graphResult] = await Promise.allSettled([
    fetchHtmlWithFallback(parsed.canonical),
    fetchPluginInfo(parsed.canonical),
    enrichFromGraph(lookupKey),
  ])

  // OG scrape
  if (htmlResult.status === 'fulfilled') {
    const { html, blocked } = htmlResult.value
    if (blocked) {
      result.blocked = true
    } else {
      result.name = metaContent(html, 'og:title')
      result.description = metaContent(html, 'og:description')
      result.profileImage = metaContent(html, 'og:image')
      result.ogType = metaContent(html, 'og:type')
      if (!result.actorId) result.actorId = extractActorId(html)
      // Engagement signals from the OG description string.
      const signals = parseEngagementSignals(result.description)
      if (typeof signals.likes === 'number') result.fanCount = signals.likes
      if (typeof signals.talkingAbout === 'number') result.talkingAbout = signals.talkingAbout
      if (typeof signals.wereHere === 'number') result.wereHere = signals.wereHere
      if (!result.name && !result.actorId && !result.profileImage) {
        result.blocked = true
      }
    }
  } else {
    result.fetchError =
      htmlResult.reason instanceof Error ? htmlResult.reason.message : 'FETCH_FAILED'
  }

  // Plugin-embed lookup — surfaces the real page entity ID without needing
  // a Graph API token. Only applies to pages, not personal profiles.
  if (pluginResult.status === 'fulfilled' && pluginResult.value) {
    const plug = pluginResult.value
    result.pageId = plug.pageId
    // Override og:image with a browser-usable avatar URL. The og:image from
    // FB's crawler endpoint returns an HTML redirect blob (not an image) when
    // used as <img src>, so browsers show a broken icon. The Graph picture
    // endpoint returns a real HTTP 302 → fbcdn image and works directly.
    result.profileImage = `https://graph.facebook.com/${plug.pageId}/picture?type=large`
    // Fallback name from plugin response when OG scrape times out or returns
    // empty (heavy pages can blow the 8s OG fetch budget).
    if (!result.name && plug.pageName) result.name = plug.pageName
    // Clear the fetchError signal when the plugin path gave us usable data —
    // the UI shouldn't render an error banner if we have name + pageId + avatar.
    if (result.fetchError && (result.name || result.pageId)) {
      delete result.fetchError
    }
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
