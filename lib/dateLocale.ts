// Map route locale to the locale used for formatting post dates.
const dateLocales: Record<string, string> = { vi: 'vi-VN', en: 'en-US' }

export const dateLocale = (locale: string) => dateLocales[locale] || 'vi-VN'
