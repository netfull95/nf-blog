import { MetadataRoute } from 'next'
import { allBlogs } from 'contentlayer/generated'
import siteMetadata from '@/data/siteMetadata'
import { routing } from '@/i18n/routing'
import { tools } from '@/data/toolsData'

export const dynamic = 'force-static'

const localePrefix = (locale: string) =>
  locale === routing.defaultLocale ? '' : `/${locale}`

const hreflangFor = (locale: string) => (locale === 'vi' ? 'vi-VN' : 'en-US')

function localizedUrl(path: string, locale: string) {
  const prefix = localePrefix(locale)
  return `${siteMetadata.siteUrl}${prefix}${path}`
}

function buildAlternates(path: string, includeSelf = true) {
  const languages: Record<string, string> = {}
  for (const locale of routing.locales) {
    languages[hreflangFor(locale)] = localizedUrl(path, locale)
  }
  // x-default points to the canonical default-locale URL.
  languages['x-default'] = localizedUrl(path, routing.defaultLocale)
  return languages
}

export default function sitemap(): MetadataRoute.Sitemap {
  const today = new Date().toISOString().split('T')[0]

  // Static routes — emit one entry per locale, plus per-locale hreflang alternates.
  const staticPaths = [
    '',
    '/blog',
    '/tags',
    '/tools',
    '/about',
    ...tools.map((tool) => `/tools/${tool.slug}`),
  ]
  const staticRoutes: MetadataRoute.Sitemap = []
  for (const locale of routing.locales) {
    for (const path of staticPaths) {
      staticRoutes.push({
        url: localizedUrl(path, locale),
        lastModified: today,
        alternates: { languages: buildAlternates(path) },
      })
    }
  }

  // Blog posts — only emit at the locale the post was authored in.
  const blogRoutes: MetadataRoute.Sitemap = allBlogs
    .filter((post) => !post.draft)
    .map((post) => {
      const lang = post.language ?? 'vi'
      return {
        url: localizedUrl(`/blog/${post.slug}`, lang),
        lastModified: post.lastmod || post.date,
      }
    })

  return [...staticRoutes, ...blogRoutes]
}
