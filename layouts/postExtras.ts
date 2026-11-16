import type { SeriesKey } from '@/data/series'

// Extra data the post page passes to every post layout.
export type PostTranslation = { slug: string; locale: string }
export type PostSeries = {
  key: SeriesKey
  slug: string
  posts: { slug: string; title: string }[]
}
