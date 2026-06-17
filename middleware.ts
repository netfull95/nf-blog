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

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

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
