import { slug } from 'github-slugger'
import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer'
import ListLayout from '@/layouts/ListLayoutWithTags'
import { allBlogs } from 'contentlayer/generated'
import tagDataVi from 'app/tag-data.vi.json'
import tagDataEn from 'app/tag-data.en.json'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'

const POSTS_PER_PAGE = 5

const tagDataByLocale: Record<string, Record<string, number>> = {
  vi: tagDataVi as Record<string, number>,
  en: tagDataEn as Record<string, number>,
}

export const generateStaticParams = async () => {
  const out: { locale: string; tag: string; page: string }[] = []
  for (const locale of routing.locales) {
    const tagCounts = tagDataByLocale[locale] || {}
    for (const tag of Object.keys(tagCounts)) {
      const postCount = tagCounts[tag]
      const totalPages = Math.max(1, Math.ceil(postCount / POSTS_PER_PAGE))
      for (let i = 0; i < totalPages; i++) {
        out.push({ locale, tag: encodeURI(tag), page: (i + 1).toString() })
      }
    }
  }
  return out
}

export default async function TagPage(props: {
  params: Promise<{ locale: string; tag: string; page: string }>
}) {
  const params = await props.params
  setRequestLocale(params.locale)
  const tag = decodeURI(params.tag)
  const title = tag[0].toUpperCase() + tag.split(' ').join('-').slice(1)
  const pageNumber = parseInt(params.page)
  const filteredPosts = allCoreContent(
    sortPosts(
      allBlogs.filter(
        (post) =>
          (post.language ?? 'vi') === params.locale &&
          post.tags &&
          post.tags.map((t) => slug(t)).includes(tag)
      )
    )
  )
  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE)

  if (pageNumber <= 0 || pageNumber > totalPages || isNaN(pageNumber)) {
    return notFound()
  }
  const initialDisplayPosts = filteredPosts.slice(
    POSTS_PER_PAGE * (pageNumber - 1),
    POSTS_PER_PAGE * pageNumber
  )
  const pagination = {
    currentPage: pageNumber,
    totalPages: totalPages,
  }

  return (
    <ListLayout
      posts={filteredPosts}
      initialDisplayPosts={initialDisplayPosts}
      pagination={pagination}
      title={title}
    />
  )
}
