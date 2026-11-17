import { notFound } from 'next/navigation'
import { allBlogs } from 'contentlayer/generated'
import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer'
import { formatDate } from 'pliny/utils/formatDate'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import Link from '@/components/Link'
import { routing } from '@/i18n/routing'
import { genPageMetadata } from 'app/seo'
import { localizedUrl } from '@/lib/seo'
import { dateLocale } from '@/lib/dateLocale'
import { series as allSeries, seriesBySlug, seriesOf } from '@/data/series'

function seriesPosts(key: string, locale: string) {
  return allCoreContent(sortPosts(allBlogs)).filter(
    (p) => (p.language ?? 'vi') === locale && !p.draft && seriesOf(p) === key
  )
}

// Only build a series page in a locale that actually has posts for it.
export const generateStaticParams = async () =>
  routing.locales.flatMap((locale) =>
    allSeries
      .filter((s) => seriesPosts(s.key, locale).length > 0)
      .map((s) => ({ locale, slug: s.slug }))
  )

export const dynamicParams = false

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  const def = seriesBySlug(slug)
  if (!def) return
  const t = await getTranslations({ locale, namespace: 'Home' })
  const ts = await getTranslations({ locale, namespace: 'Series' })
  const title = t(`series.${def.key}.title`)
  const path = `/series/${slug}`
  const inAllLocales = routing.locales.every((l) => seriesPosts(def.key, l).length > 0)
  return genPageMetadata({
    title,
    description: ts('metaDescription', { series: title }),
    path,
    locale,
    // Skip hreflang alternates when the series only exists in one language.
    ...(inAllLocales ? {} : { alternates: { canonical: localizedUrl(path, locale) } }),
  })
}

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const def = seriesBySlug(slug)
  if (!def) return notFound()
  const posts = seriesPosts(def.key, locale)
  if (!posts.length) return notFound()
  const t = await getTranslations('Home')
  const ts = await getTranslations('Series')
  const dl = dateLocale(locale)

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      <header className="space-y-3 pt-6 pb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-gray-100">
          {t(`series.${def.key}.title`)}
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          {t(`series.${def.key}.description`)}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {ts('count', { count: posts.length })}
        </p>
      </header>
      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {posts.map((post) => (
          <li key={post.slug} className="py-6">
            <time dateTime={post.date} className="text-sm text-gray-500 dark:text-gray-400">
              {formatDate(post.date, dl)}
            </time>
            <h2 className="mt-1 text-xl leading-8 font-bold">
              <Link
                href={`/blog/${post.slug}`}
                className="hover:text-primary-600 dark:hover:text-primary-400 text-gray-900 dark:text-gray-100"
              >
                {post.title}
              </Link>
            </h2>
            {post.summary && (
              <p className="mt-2 leading-7 text-gray-600 dark:text-gray-300">{post.summary}</p>
            )}
          </li>
        ))}
      </ul>
      <div className="pt-6">
        <Link
          href="/"
          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 text-sm font-medium"
        >
          {ts('back')}
        </Link>
      </div>
    </div>
  )
}
