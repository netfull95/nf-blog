import { sortPosts, allCoreContent } from 'pliny/utils/contentlayer'
import { allBlogs } from 'contentlayer/generated'
import { setRequestLocale } from 'next-intl/server'
import Main from './Main'

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const sortedPosts = sortPosts(allBlogs)
  const posts = allCoreContent(sortedPosts).filter((p) => (p.language ?? 'vi') === locale)
  return <Main posts={posts} />
}
