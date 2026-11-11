import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['vi', 'en'],
  defaultLocale: 'vi',
  localePrefix: 'as-needed',
  // Keep each URL stable regardless of visitor language, cookie or country.
  localeDetection: false,
  // Post translations have different slugs. Metadata and sitemap emit the
  // actual counterparts instead of middleware guessing same-slug URLs.
  alternateLinks: false,
})

export type Locale = (typeof routing.locales)[number]
