import 'css/prism.css'
import 'katex/dist/katex.css'

import PageTitle from '@/components/PageTitle'
import { components } from '@/components/MDXComponents'
import { MDXLayoutRenderer } from 'pliny/mdx-components'
import { sortPosts, coreContent, allCoreContent } from 'pliny/utils/contentlayer'
import { allBlogs, allAuthors } from 'contentlayer/generated'
import type { Authors, Blog } from 'contentlayer/generated'
import PostSimple from '@/layouts/PostSimple'
import PostLayout from '@/layouts/PostLayout'
import PostBanner from '@/layouts/PostBanner'
import { Metadata } from 'next'
import siteMetadata from '@/data/siteMetadata'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import postTranslations from 'app/post-translations.json'

const translationMap = postTranslations as {
  byKey: Record<string, Partial<Record<string, string>>>
  bySlug: Record<string, string>
}

const defaultLayout = 'PostLayout'
const layouts = {
  PostSimple,
  PostLayout,
  PostBanner,
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string; slug: string[] }>
}): Promise<Metadata | undefined> {
  const params = await props.params
  const slug = decodeURI(params.slug.join('/'))
  const post = allBlogs.find(
    (p) => p.slug === slug && (p.language ?? 'vi') === params.locale
  )
  const authorList = post?.authors || ['default']
  const authorDetails = authorList.map((author) => {
    const authorResults = allAuthors.find((p) => p.slug === author)
    return coreContent(authorResults as Authors)
  })
  if (!post) {
    return
  }

  const publishedAt = new Date(post.date).toISOString()
  const modifiedAt = new Date(post.lastmod || post.date).toISOString()
  const authors = authorDetails.map((author) => author.name)
  let imageList = [siteMetadata.socialBanner]
  if (post.images) {
    imageList = typeof post.images === 'string' ? [post.images] : post.images
  }
  const ogImages = imageList.map((img) => {
    return {
      url: img && img.includes('http') ? img : siteMetadata.siteUrl + img,
    }
  })

  // hreflang alternates for the post — only emit a language entry if a
  // translation actually exists at that locale.
  const tKey = translationMap.bySlug[post.slug]
  const languages: Record<string, string> = {}
  if (tKey) {
    for (const locale of routing.locales) {
      const altSlug = translationMap.byKey[tKey]?.[locale]
      if (!altSlug) continue
      const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
      const hreflang = locale === 'vi' ? 'vi-VN' : 'en-US'
      languages[hreflang] = `${siteMetadata.siteUrl}${prefix}/blog/${altSlug}`
    }
    if (translationMap.byKey[tKey]?.[routing.defaultLocale]) {
      languages['x-default'] =
        `${siteMetadata.siteUrl}/blog/${translationMap.byKey[tKey][routing.defaultLocale]}`
    }
  }

  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      siteName: siteMetadata.title,
      locale: params.locale === 'vi' ? 'vi_VN' : 'en_US',
      type: 'article',
      publishedTime: publishedAt,
      modifiedTime: modifiedAt,
      url: './',
      images: ogImages,
      authors: authors.length > 0 ? authors : [siteMetadata.author],
    },
    alternates: Object.keys(languages).length > 0 ? { languages } : undefined,
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.summary,
      images: imageList,
    },
  }
}

export const generateStaticParams = async () => {
  const params: { locale: string; slug: string[] }[] = []
  for (const locale of routing.locales) {
    allBlogs
      .filter((p) => (p.language ?? 'vi') === locale)
      .forEach((p) => {
        params.push({ locale, slug: p.slug.split('/').map((name) => decodeURI(name)) })
      })
  }
  return params
}

export default async function Page(props: {
  params: Promise<{ locale: string; slug: string[] }>
}) {
  const params = await props.params
  setRequestLocale(params.locale)
  const slug = decodeURI(params.slug.join('/'))
  // Only consider posts in the current locale for prev/next + lookup
  const localePosts = allBlogs.filter((p) => (p.language ?? 'vi') === params.locale)
  const sortedCoreContents = allCoreContent(sortPosts(localePosts))
  const postIndex = sortedCoreContents.findIndex((p) => p.slug === slug)
  if (postIndex === -1) {
    return notFound()
  }

  const prev = sortedCoreContents[postIndex + 1]
  const next = sortedCoreContents[postIndex - 1]
  const post = localePosts.find((p) => p.slug === slug) as Blog
  const authorList = post?.authors || ['default']
  const authorDetails = authorList.map((author) => {
    const authorResults = allAuthors.find((p) => p.slug === author)
    return coreContent(authorResults as Authors)
  })
  const mainContent = coreContent(post)
  const jsonLd = post.structuredData
  jsonLd['author'] = authorDetails.map((author) => {
    return {
      '@type': 'Person',
      name: author.name,
    }
  })

  const Layout = layouts[post.layout || defaultLayout]

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Layout content={mainContent} authorDetails={authorDetails} next={next} prev={prev}>
        <MDXLayoutRenderer code={post.body.code} components={components} toc={post.toc} />
      </Layout>
    </>
  )
}
