// Series grouping for the home page. Posts are matched by `translationKey` so the
// VI and EN versions of a post always land in the same series. Posts without a
// translationKey (e.g. personal finance) are matched by slug prefix instead.
// Labels live in messages/<locale>.json under "Home.series.<key>".

export type SeriesKey = 'pancakeApi' | 'pancakeCrm' | 'noCodeAi' | 'personalFinance'

export type SeriesDefinition = {
  key: SeriesKey
  // URL segment for /series/<slug>
  slug: string
  translationKeys?: string[]
  slugPrefixes?: string[]
}

export const series: SeriesDefinition[] = [
  {
    key: 'pancakeApi',
    slug: 'pancake-api',
    translationKeys: [
      'pancake-extraction-options',
      'pancake-webhook-api',
      'pancake-list-conversations',
      'pancake-page-customers',
      'pancake-conversation-workflow',
      'pancake-statistics',
      'pancake-webhook-idempotency',
      'pancake-conversation-source-tracking',
    ],
  },
  {
    key: 'pancakeCrm',
    slug: 'pancake-crm',
    translationKeys: ['intro-pancake-crm', 'pancake-crm-records', 'pancake-crm-mcp-reporting'],
  },
  {
    key: 'noCodeAi',
    slug: 'no-code-ai',
    translationKeys: [
      'intro-pancake',
      'pancake-api-mcp-guide',
      'pancake-mcp-no-code-use-cases',
      'botcake-auto-reply-after-hours',
      'pancake-email-smtp-imap-setup',
      'zalo-personal-cleanup',
    ],
  },
  {
    key: 'personalFinance',
    slug: 'personal-finance',
    slugPrefixes: ['toan-canh-tai-chinh-ca-nhan'],
  },
]

// Series that get the "personal blog, not an official Pancake channel" note.
export const pancakeSeries: SeriesKey[] = ['pancakeApi', 'pancakeCrm', 'noCodeAi']

// Pinned on the home page under "Start here".
export const featuredTranslationKeys = ['pancake-extraction-options']

export function seriesOf(post: { translationKey?: string; slug: string }): SeriesKey | undefined {
  return series.find(
    (s) =>
      (post.translationKey && s.translationKeys?.includes(post.translationKey)) ||
      s.slugPrefixes?.some((p) => post.slug.startsWith(p))
  )?.key
}

export function seriesBySlug(slug: string) {
  return series.find((s) => s.slug === slug)
}

export function seriesSlug(key: SeriesKey) {
  return series.find((s) => s.key === key)?.slug
}
