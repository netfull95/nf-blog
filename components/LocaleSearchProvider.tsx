'use client'

import { ReactNode, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { KBarSearchProvider } from 'pliny/search/KBar'
import { formatDate } from 'pliny/utils/formatDate'
import siteMetadata from '@/data/siteMetadata'
import { routing } from '@/i18n/routing'
import { dateLocale } from '@/lib/dateLocale'

type SearchDoc = { slug: string; title: string; summary?: string; date: string; language?: string }

// kbar search limited to posts in the current locale, linking to the localized URL.
export default function LocaleSearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Search')
  const section = t('section')

  const onSearchDocumentsLoad = useCallback(
    (docs: SearchDoc[]) => {
      const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
      return docs
        .filter((doc) => (doc.language ?? routing.defaultLocale) === locale)
        .map((doc) => ({
          id: doc.slug,
          name: doc.title,
          keywords: doc.summary || '',
          section,
          subtitle: formatDate(doc.date, dateLocale(locale)),
          perform: () => router.push(`${prefix}/blog/${doc.slug}`),
        }))
    },
    [locale, router, section]
  )

  const { searchDocumentsPath } = (siteMetadata.search as { kbarConfig: { searchDocumentsPath: string } })
    .kbarConfig
  return (
    // Remount per locale so the documents are re-filtered after switching language.
    <KBarSearchProvider key={locale} kbarConfig={{ searchDocumentsPath, onSearchDocumentsLoad }}>
      {children}
    </KBarSearchProvider>
  )
}
