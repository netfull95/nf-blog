import type { SeriesKey } from '@/data/series'

export type HomePost = {
  slug: string
  title: string
  summary?: string
  date: string
  minutes: number
  series?: SeriesKey
  translationKey?: string
  cover?: string
}
