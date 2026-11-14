// Series grouping for the home page. Posts are matched by `translationKey` so the
// VI and EN versions of a post always land in the same series. Posts without a
// translationKey (e.g. personal finance) are matched by slug prefix instead.
// Labels live in messages/<locale>.json under "Home.series.<key>".

export type SeriesKey = 'pancakeApi' | 'pancakeCrm' | 'noCodeAi' | 'personalFinance'

export type SeriesDefinition = {
  key: SeriesKey
  translationKeys?: string[]
  slugPrefixes?: string[]
}

export const series: SeriesDefinition[] = [
  {
    key: 'pancakeApi',
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
    translationKeys: ['intro-pancake-crm', 'pancake-crm-records', 'pancake-crm-mcp-reporting'],
  },
  {
    key: 'noCodeAi',
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
    slugPrefixes: ['toan-canh-tai-chinh-ca-nhan'],
  },
]

// Pinned on the home page under "Start here".
export const featuredTranslationKeys = ['pancake-extraction-options']

export function seriesOf(post: { translationKey?: string; slug: string }): SeriesKey | undefined {
  return series.find(
    (s) =>
      (post.translationKey && s.translationKeys?.includes(post.translationKey)) ||
      s.slugPrefixes?.some((p) => post.slug.startsWith(p))
  )?.key
}
