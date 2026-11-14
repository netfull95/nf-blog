import Link from '@/components/Link'
import { formatDate } from 'pliny/utils/formatDate'
import { getLocale, getTranslations } from 'next-intl/server'
import { dateLocale } from '@/lib/dateLocale'
import type { HomePost } from './types'

export default async function LatestPosts({ posts }: { posts: HomePost[] }) {
  const t = await getTranslations('Home')
  const tc = await getTranslations('Common')
  const locale = dateLocale(await getLocale())
  return (
    <section className="py-10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          {t('latestSection.title')}
        </h2>
        <Link
          href="/blog"
          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 text-sm font-medium"
        >
          {tc('allPosts')} &rarr;
        </Link>
      </div>
      {!posts.length && <p className="mt-4 text-gray-500">{t('noPosts')}</p>}
      <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
        {posts.map((post) => (
          <li key={post.slug} className="py-4 sm:grid sm:grid-cols-[9rem_1fr] sm:gap-4">
            <time
              dateTime={post.date}
              className="text-sm leading-7 text-gray-500 dark:text-gray-400"
            >
              {formatDate(post.date, locale)}
            </time>
            <div>
              <Link
                href={`/blog/${post.slug}`}
                className="hover:text-primary-600 dark:hover:text-primary-400 text-lg leading-7 font-semibold text-gray-900 dark:text-gray-100"
              >
                {post.title}
              </Link>
              <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-gray-500 dark:text-gray-400">
                {post.series && <span>{t(`series.${post.series}.title`)}</span>}
                <span>{t('minutesRead', { minutes: post.minutes })}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
