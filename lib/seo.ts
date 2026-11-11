import siteMetadata from '@/data/siteMetadata'
import { routing } from '@/i18n/routing'

export function localizedUrl(path: string, locale: string) {
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
  return `${siteMetadata.siteUrl}${prefix}${path}`
}

const hreflangFor = (locale: string) => (locale === 'vi' ? 'vi-VN' : 'en-US')

// Only use for routes that exist at the same path in both locales.
export function pageLanguages(path: string) {
  return {
    'vi-VN': localizedUrl(path, 'vi'),
    'en-US': localizedUrl(path, 'en'),
    'x-default': localizedUrl(path, routing.defaultLocale),
  }
}

interface TranslatablePost {
  slug: string
  language?: string
  translationKey?: string
  draft?: boolean
}

export function postLanguages(post: TranslatablePost, posts: TranslatablePost[]) {
  const languages: Record<string, string> = {}
  const translations = posts.filter(
    (candidate) =>
      !candidate.draft &&
      (candidate.slug === post.slug ||
        (post.translationKey && candidate.translationKey === post.translationKey))
  )
  for (const translation of translations) {
    const locale = translation.language ?? routing.defaultLocale
    if (!routing.locales.some((supported) => supported === locale)) continue
    const url = localizedUrl(`/blog/${translation.slug}`, locale)
    languages[hreflangFor(locale)] = url
    if (locale === routing.defaultLocale) languages['x-default'] = url
  }
  return languages
}
