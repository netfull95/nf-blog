import { genPageMetadata } from 'app/seo'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import QRGenerator from '@/components/tools/QRGenerator'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Tools.qr' })
  return genPageMetadata({ title: t('metaTitle'), description: t('metaDescription') })
}

export default async function QRGeneratorPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'Tools.qr' })

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      <div className="space-y-2 pt-6 pb-8 md:space-y-5">
        <h1 className="text-3xl leading-9 font-extrabold tracking-tight text-gray-900 sm:text-4xl sm:leading-10 md:text-5xl md:leading-14 dark:text-gray-100">
          {t('title')}
        </h1>
        <p className="text-lg leading-7 text-gray-500 dark:text-gray-400">{t('metaDescription')}</p>
      </div>
      <div className="py-8">
        <QRGenerator />
      </div>
    </div>
  )
}
