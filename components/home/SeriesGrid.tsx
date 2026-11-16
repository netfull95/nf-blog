import Link from '@/components/Link'
import { getTranslations } from 'next-intl/server'
import { seriesSlug, type SeriesKey } from '@/data/series'
import type { HomePost } from './types'

const MAX_POSTS_PER_SERIES = 4

export default async function SeriesGrid({
  groups,
}: {
  groups: { key: SeriesKey; posts: HomePost[] }[]
}) {
  const t = await getTranslations('Home')
  return (
    <section className="py-10">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        {t('seriesSection.title')}
      </h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {t('seriesSection.disclaimer')}
      </p>
      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {groups.map(({ key, posts }) => (
          <div
            key={key}
            className="flex flex-col rounded-2xl border border-gray-200 p-5 dark:border-gray-700"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {t(`series.${key}.title`)}
              </h3>
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                {t('seriesSection.postCount', { count: posts.length })}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {t(`series.${key}.description`)}
            </p>
            <ul className="mt-4 space-y-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              {posts.slice(0, MAX_POSTS_PER_SERIES).map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="hover:text-primary-600 dark:hover:text-primary-400 text-sm leading-6 text-gray-800 dark:text-gray-200"
                  >
                    {post.title}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={`/series/${seriesSlug(key)}`}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 mt-auto pt-4 text-sm font-medium"
            >
              {t('seriesSection.viewAll')} &rarr;
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
