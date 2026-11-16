import { localizedUrl, pageLanguages } from '@/lib/seo'
import { sortPosts, allCoreContent } from 'pliny/utils/contentlayer'
import { allBlogs, allAuthors } from 'contentlayer/generated'
import siteMetadata from '@/data/siteMetadata'
import { setRequestLocale } from 'next-intl/server'
import Main from './Main'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return { alternates: { canonical: localizedUrl('', locale), languages: pageLanguages('') } }
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const sortedPosts = sortPosts(allBlogs)
  const posts = allCoreContent(sortedPosts).filter((p) => (p.language ?? 'vi') === locale)
  const author = allAuthors.find((a) => a.slug === 'default')
  const homeUrl = localizedUrl('', locale)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteMetadata.siteUrl}/#website`,
        url: homeUrl,
        name: siteMetadata.title,
        inLanguage: locale === 'vi' ? 'vi-VN' : 'en-US',
        publisher: { '@id': `${siteMetadata.siteUrl}/#person` },
      },
      {
        '@type': 'Person',
        '@id': `${siteMetadata.siteUrl}/#person`,
        name: siteMetadata.author,
        url: homeUrl,
        jobTitle: author?.occupation,
        worksFor: author?.company ? { '@type': 'Organization', name: author.company } : undefined,
        image: author?.avatar ? `${siteMetadata.siteUrl}${author.avatar}` : undefined,
        sameAs: [author?.linkedin, siteMetadata.github, siteMetadata.facebook, siteMetadata.youtube].filter(
          Boolean
        ),
      },
    ],
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Main posts={posts} />
    </>
  )
}
