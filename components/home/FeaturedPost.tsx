import Link from '@/components/Link'
import Image from '@/components/Image'
import { getTranslations } from 'next-intl/server'
import type { HomePost } from './types'

export default async function FeaturedPost({ post }: { post: HomePost }) {
  const t = await getTranslations('Home')
  return (
    <section className="py-10">
      <h2 className="mb-5 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
        {t('featured.title')}
      </h2>
      <Link
        href={`/blog/${post.slug}`}
        className="group hover:border-primary-500 grid overflow-hidden rounded-2xl border border-gray-200 transition-colors md:grid-cols-2 dark:border-gray-700"
      >
        {post.cover && (
          <div className="relative aspect-video bg-gray-100 md:aspect-auto md:min-h-64 dark:bg-gray-800">
            <Image
              src={post.cover}
              alt=""
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </div>
        )}
        <div className="flex flex-col justify-center p-6 md:p-8">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
            {post.series && (
              <span className="text-primary-600 dark:text-primary-400 font-medium">
                {t(`series.${post.series}.title`)}
              </span>
            )}
            <span>{t('minutesRead', { minutes: post.minutes })}</span>
          </div>
          <h3 className="group-hover:text-primary-600 dark:group-hover:text-primary-400 text-2xl leading-snug font-bold text-gray-900 dark:text-gray-100">
            {post.title}
          </h3>
          {post.summary && (
            <p className="mt-3 line-clamp-3 leading-7 text-gray-600 dark:text-gray-300">
              {post.summary}
            </p>
          )}
          <span className="text-primary-600 dark:text-primary-400 mt-4 inline-block font-medium">
            {t('featured.readPost')} &rarr;
          </span>
        </div>
      </Link>
    </section>
  )
}
