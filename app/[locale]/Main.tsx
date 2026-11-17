import { allAuthors } from 'contentlayer/generated'
import { featuredTranslationKeys, series, seriesCover, seriesOf } from '@/data/series'
import Hero from '@/components/home/Hero'
import FeaturedPost from '@/components/home/FeaturedPost'
import SeriesGrid from '@/components/home/SeriesGrid'
import LatestPosts from '@/components/home/LatestPosts'
import MoreStrip from '@/components/home/MoreStrip'
import ContactBlock from '@/components/home/ContactBlock'
import type { HomePost } from '@/components/home/types'

const MAX_LATEST = 5
// Shown as cards; personal finance goes in the small "Other" strip instead.
const PRIMARY_SERIES = series.filter((s) => s.key !== 'personalFinance')

export default async function Home({ posts }) {
  const author = allAuthors.find((a) => a.slug === 'default')
  const homePosts: HomePost[] = posts
    .filter((p) => !p.draft)
    .map((p) => {
      const key = seriesOf(p)
      return {
        slug: p.slug,
        title: p.title,
        summary: p.summary,
        date: p.date,
        minutes: Math.max(1, Math.round(p.readingTime?.minutes ?? 1)),
        series: key,
        translationKey: p.translationKey,
        cover: p.cover ?? (key ? seriesCover(key) : undefined),
      }
    })

  const featured = homePosts.find(
    (p) => p.translationKey && featuredTranslationKeys.includes(p.translationKey)
  )
  const groups = PRIMARY_SERIES.map((s) => ({
    key: s.key,
    posts: homePosts.filter((p) => p.series === s.key),
  })).filter((g) => g.posts.length)
  const financePost = homePosts.find((p) => p.series === 'personalFinance')

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      <Hero avatar={author?.avatar} />
      {featured && <FeaturedPost post={featured} />}
      <SeriesGrid groups={groups} />
      <LatestPosts posts={homePosts.slice(0, MAX_LATEST)} />
      <MoreStrip financePost={financePost} />
      <ContactBlock email={author?.email} linkedin={author?.linkedin} />
    </div>
  )
}
