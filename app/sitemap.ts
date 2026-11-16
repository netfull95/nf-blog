import { MetadataRoute } from 'next'
import { allBlogs } from 'contentlayer/generated'
import { routing } from '@/i18n/routing'
import { tools } from '@/data/toolsData'
import { localizedUrl, pageLanguages, postLanguages } from '@/lib/seo'
import { series, seriesOf } from '@/data/series'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
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
        alternates: { languages: pageLanguages(path) },
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
        alternates: { languages: postLanguages(post, allBlogs) },
      }
    })

  // Series pages — only in locales that have posts for the series.
  const seriesRoutes: MetadataRoute.Sitemap = []
  for (const s of series) {
    const path = `/series/${s.slug}`
    const locales = routing.locales.filter((locale) =>
      allBlogs.some(
        (post) => !post.draft && (post.language ?? 'vi') === locale && seriesOf(post) === s.key
      )
    )
    for (const locale of locales) {
      seriesRoutes.push({
        url: localizedUrl(path, locale),
        ...(locales.length === routing.locales.length
          ? { alternates: { languages: pageLanguages(path) } }
          : {}),
      })
    }
  }

  return [...staticRoutes, ...seriesRoutes, ...blogRoutes]
}
