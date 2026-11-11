import { Metadata } from 'next'
import siteMetadata from '@/data/siteMetadata'
import { localizedUrl, pageLanguages } from '@/lib/seo'

interface PageSEOProps {
  title: string
  description?: string
  image?: string
  path?: string
  locale?: string
  [key: string]: any
}

export function genPageMetadata({
  title,
  description,
  image,
  path,
  locale = 'vi',
  ...rest
}: PageSEOProps): Metadata {
  return {
    title,
    description: description || siteMetadata.description,
    openGraph: {
      title: `${title} | ${siteMetadata.title}`,
      description: description || siteMetadata.description,
      url: './',
      siteName: siteMetadata.title,
      images: image ? [image] : [siteMetadata.socialBanner],
      locale: locale === 'vi' ? 'vi_VN' : 'en_US',
      type: 'website',
    },
    twitter: {
      title: `${title} | ${siteMetadata.title}`,
      card: 'summary_large_image',
      images: image ? [image] : [siteMetadata.socialBanner],
    },
    ...(path !== undefined
      ? {
          alternates: { canonical: localizedUrl(path, locale), languages: pageLanguages(path) },
        }
      : {}),
    ...rest,
  }
}
