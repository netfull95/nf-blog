import Link from '@/components/Link'
import { getTranslations } from 'next-intl/server'
import { tools } from '@/data/toolsData'
import type { HomePost } from './types'

export default async function MoreStrip({ financePost }: { financePost?: HomePost }) {
  const t = await getTranslations('Home.more')
  const tt = await getTranslations('Tools')
  return (
    <section className="py-8">
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {t('title')}
      </h2>
      <div className="flex flex-wrap gap-3">
        {tools.map((tool) => (
          <Link
            key={tool.slug}
            href={`/tools/${tool.slug}`}
            className="hover:border-primary-500 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300"
          >
            <span aria-hidden="true">{tool.icon}</span> {tt(`${tool.i18nKey}.title`)}
          </Link>
        ))}
        {financePost && (
          <Link
            href={`/blog/${financePost.slug}`}
            className="hover:border-primary-500 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300"
          >
            <span aria-hidden="true">💰</span> {t('finance')}
          </Link>
        )}
      </div>
    </section>
  )
}
