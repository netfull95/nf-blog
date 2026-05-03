import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Skip API, Next internals, static assets, and SEO files
  matcher: ['/((?!api|_next|_vercel|sitemap.xml|robots.txt|feed.xml|search.json|static|.*\\..*).*)'],
}
