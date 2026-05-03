import { genPageMetadata } from 'app/seo'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { tools } from '@/data/toolsData'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Tools' })
  return genPageMetadata({ title: t('metaTitle'), description: t('metaDescription') })
}

export default async function ToolsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'Tools' })

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      <div className="space-y-2 pt-6 pb-8 md:space-y-5">
        <h1 className="text-3xl leading-9 font-extrabold tracking-tight text-gray-900 sm:text-4xl sm:leading-10 md:text-6xl md:leading-14 dark:text-gray-100">
          {t('title')}
        </h1>
        <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">{t('description')}</p>
      </div>
      <ul className="grid grid-cols-1 gap-6 py-12 sm:grid-cols-2">
        {tools.map((tool) => (
          <li key={tool.slug}>
            <Link
              href={`/tools/${tool.slug}`}
              aria-label={t('openTool')}
              className="hover:border-primary-500 dark:hover:border-primary-400 group flex h-full flex-col rounded-lg border border-gray-200 bg-white p-6 transition-colors dark:border-gray-700 dark:bg-gray-900"
            >
              <div className="mb-3 text-4xl" aria-hidden="true">
                {tool.icon}
              </div>
              <h2 className="group-hover:text-primary-500 dark:group-hover:text-primary-400 text-xl font-semibold text-gray-900 dark:text-gray-100">
                {t(`${tool.i18nKey}.title` as 'qr.title')}
              </h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {t(`${tool.i18nKey}.shortDescription` as 'qr.shortDescription')}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
