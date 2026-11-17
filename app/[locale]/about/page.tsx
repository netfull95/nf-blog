import { Authors, allAuthors } from 'contentlayer/generated'
import { MDXLayoutRenderer } from 'pliny/mdx-components'
import AuthorLayout from '@/layouts/AuthorLayout'
import AboutResume, { GratitudeNote } from '@/components/about/AboutResume'
import { coreContent } from 'pliny/utils/contentlayer'
import { genPageMetadata } from 'app/seo'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return genPageMetadata({ title: locale === 'vi' ? 'Về tôi' : 'About', path: '/about', locale })
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const authorSlug = locale === 'vi' ? 'default-vi' : 'default'
  const author = allAuthors.find((p) => p.slug === authorSlug) as Authors
  const mainContent = coreContent(author)

  return (
    <>
      <AuthorLayout
        content={mainContent}
        locale={locale}
        title={locale === 'vi' ? 'Dẫn dắt tích hợp từ đối tác đến vận hành' : 'Leading integrations from partners to operations'}
      >
        <div className="space-y-14">
          <AboutResume locale={locale === 'vi' ? 'vi' : 'en'} />
          <div className="prose dark:prose-invert max-w-none border-t border-gray-200 pt-10 dark:border-gray-700">
            <MDXLayoutRenderer code={author.body.code} />
          </div>
          <GratitudeNote locale={locale === 'vi' ? 'vi' : 'en'} />
        </div>
      </AuthorLayout>
    </>
  )
}
