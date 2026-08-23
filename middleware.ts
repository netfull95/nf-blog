import { NextRequest, NextResponse } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

// Vercel injects `x-vercel-ip-country` (ISO 3166-1 alpha-2) on every request
// for free across all plans. It's absent in local dev — fall back to "VN" so
// dev mirrors the default-locale experience.
function geoCountry(req: NextRequest): string {
  return req.headers.get('x-vercel-ip-country') || 'VN'
}

// Markdown content negotiation for blog posts. When an AI agent (or any
// client) sends `Accept: text/markdown`, return the raw MDX instead of
// rendered HTML by rewriting to /api/blog/markdown/{slug}. The URL the agent
// sees stays the same; only the response body changes.
function maybeRewriteToMarkdown(req: NextRequest): NextResponse | null {
  const accept = req.headers.get('accept') || ''
  if (!accept.includes('text/markdown')) return null

  // Match /blog/{slug} or /en/blog/{slug}. Skip listing pages (just /blog).
  const match = req.nextUrl.pathname.match(/^\/(?:en\/)?blog\/(.+)$/)
  if (!match) return null

  const url = req.nextUrl.clone()
  url.pathname = `/api/blog/markdown/${match[1]}`
  return NextResponse.rewrite(url)
}

// Short aliases whose visible URL must stay unchanged (rewrite, not redirect).
// The next.config `rewrites()` runs AFTER this middleware, and next-intl
// internally maps `/sale` → `/vi/sale` (which doesn't exist), so a
// config-level rewrite doesn't match. Handle it here instead — rewrite to
// the explicit-locale path so file-system routing lands on the real page.
const ALIAS_REWRITES: Record<string, string> = {
  '/sale': '/vi/tools/shopee-deals',
  '/en/sale': '/en/tools/shopee-deals',
}

function maybeRewriteAlias(req: NextRequest): NextResponse | null {
  const pathname = req.nextUrl.pathname
  const target = ALIAS_REWRITES[pathname]
  if (!target) return null
  const url = req.nextUrl.clone()
  url.pathname = target
  return NextResponse.rewrite(url)
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Markdown for Agents — must run before intl middleware so the rewrite
  // bypasses locale routing entirely.
  const markdownResponse = maybeRewriteToMarkdown(req)
  if (markdownResponse) return markdownResponse

  // Short-alias rewrites (e.g. /sale → deals board) — also bypass intl so
  // next-intl doesn't try to re-locale a path that has no matching page.
  const aliasResponse = maybeRewriteAlias(req)
  if (aliasResponse) return aliasResponse

  // Only consider redirecting on the default-locale homepage. We don't touch
  // paths already under /en, or any blog/slug path that may not have an EN
  // counterpart at the same URL (VI slugs differ from EN slugs).
  if (pathname === '/' && geoCountry(req) !== 'VN') {
    const url = req.nextUrl.clone()
    url.pathname = '/en'
    return NextResponse.redirect(url)
  }

  return intlMiddleware(req)
}

export const config = {
  // Skip API, Next internals, static assets, and SEO files
  matcher: ['/((?!api|_next|_vercel|sitemap.xml|robots.txt|feed.xml|search.json|static|.*\\..*).*)'],
}
