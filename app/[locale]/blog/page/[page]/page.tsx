import ListLayout from '@/layouts/ListLayoutWithTags'
import { allCoreContent, sortPosts } from 'pliny/utils/contentlayer'
import { allBlogs } from 'contentlayer/generated'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'

const POSTS_PER_PAGE = 5

export const generateStaticParams = async () => {
  const paths: { locale: string; page: string }[] = []
  for (const locale of routing.locales) {
    const count = allBlogs.filter((p) => (p.language ?? 'vi') === locale).length
    const totalPages = Math.ceil(count / POSTS_PER_PAGE)
    for (let i = 0; i < totalPages; i++) {
      paths.push({ locale, page: (i + 1).toString() })
    }
  }
  return paths
}

export default async function Page(props: { params: Promise<{ locale: string; page: string }> }) {
  const params = await props.params
  setRequestLocale(params.locale)
  const t = await getTranslations({ locale: params.locale, namespace: 'Blog' })
  const posts = allCoreContent(sortPosts(allBlogs)).filter(
    (p) => (p.language ?? 'vi') === params.locale
  )
  const pageNumber = parseInt(params.page as string)
  const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE)

  if (pageNumber <= 0 || pageNumber > totalPages || isNaN(pageNumber)) {
    return notFound()
  }
  const initialDisplayPosts = posts.slice(
    POSTS_PER_PAGE * (pageNumber - 1),
    POSTS_PER_PAGE * pageNumber
  )
  const pagination = {
    currentPage: pageNumber,
    totalPages: totalPages,
  }

  return (
    <ListLayout
      posts={posts}
      initialDisplayPosts={initialDisplayPosts}
      pagination={pagination}
      title={t('title')}
    />
  )
}
