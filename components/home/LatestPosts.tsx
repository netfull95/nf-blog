import Link from '@/components/Link'
import Image from '@/components/Image'
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
          <li key={post.slug} className="group flex items-center gap-4 py-4">
            {post.cover && (
              <Link
                href={`/blog/${post.slug}`}
                tabIndex={-1}
                aria-hidden="true"
                className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-gray-100 sm:w-40 dark:bg-gray-800"
              >
                <Image src={post.cover} alt="" fill sizes="160px" className="object-cover" />
              </Link>
            )}
            <div className="min-w-0">
              <Link
                href={`/blog/${post.slug}`}
                className="hover:text-primary-600 dark:hover:text-primary-400 line-clamp-2 text-lg leading-7 font-semibold text-gray-900 dark:text-gray-100"
              >
                {post.title}
              </Link>
              <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-gray-500 dark:text-gray-400">
                <time dateTime={post.date}>{formatDate(post.date, locale)}</time>
                {post.series && (
                  <span className="hidden sm:inline">{t(`series.${post.series}.title`)}</span>
                )}
                <span>{t('minutesRead', { minutes: post.minutes })}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
