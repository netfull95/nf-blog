import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['vi', 'en'],
  defaultLocale: 'vi',
  localePrefix: 'as-needed',
  // Disable next-intl's Accept-Language auto-detection — we handle locale
  // selection ourselves in middleware based on the visitor's geo IP
  // (x-vercel-ip-country header). VN → VI default, others → /en.
  localeDetection: false,
})

export type Locale = (typeof routing.locales)[number]
