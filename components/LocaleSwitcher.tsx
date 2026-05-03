'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'
import postTranslations from 'app/post-translations.json'

type TranslationMap = {
  byKey: Record<string, Partial<Record<Locale, string>>>
  bySlug: Record<string, string>
}

const map = postTranslations as TranslationMap

const BLOG_DETAIL = /^\/blog\/(.+)$/

const LocaleSwitcher = () => {
  const locale = useLocale() as Locale
  const t = useTranslations('Locale')
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as Locale

    // If we're on a blog detail page, try to map to the translated slug.
    const m = pathname.match(BLOG_DETAIL)
    if (m) {
      const currentSlug = decodeURIComponent(m[1])
      const key = map.bySlug[currentSlug]
      const alt = key ? map.byKey[key]?.[next] : undefined
      if (alt) {
        startTransition(() => {
          router.replace(`/blog/${alt}`, { locale: next })
        })
        return
      }
      // No translation available — fall back to the blog index of the target locale.
      startTransition(() => {
        router.replace('/blog', { locale: next })
      })
      return
    }

    startTransition(() => {
      router.replace(pathname, { locale: next })
    })
  }

  return (
    <label className="relative" aria-label={t('switchTo')}>
      <select
        value={locale}
        onChange={onChange}
        disabled={isPending}
        className="hover:border-primary-500 focus:border-primary-500 appearance-none rounded-sm border border-gray-300 bg-white px-2 py-1 pr-6 text-sm font-medium text-gray-900 focus:outline-hidden dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-xs text-gray-500">
        ▾
      </span>
    </label>
  )
}

export default LocaleSwitcher
