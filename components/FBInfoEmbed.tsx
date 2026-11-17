'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import FBInfoExtractor from '@/components/tools/FBInfoExtractor'

// FB Info Lookup embedded in a post (MDX: <FBInfoEmbed />), collapsed by default
// so it doesn't push the article down.
export default function FBInfoEmbed() {
  const t = useTranslations('Tools.fb')

  return (
    <details className="not-prose my-6 rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700">
      <summary className="cursor-pointer font-semibold text-gray-900 dark:text-gray-100">
        {t('embedSummary')}
      </summary>
      <div className="pt-4">
        <FBInfoExtractor />
        <Link
          href="/tools/fb-info"
          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 mt-4 inline-block text-sm font-medium"
        >
          {t('embedOpenFull')} &rarr;
        </Link>
      </div>
    </details>
  )
}
