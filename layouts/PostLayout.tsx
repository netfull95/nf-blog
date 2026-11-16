import { ReactNode } from 'react'
import { CoreContent } from 'pliny/utils/contentlayer'
import type { Blog, Authors } from 'contentlayer/generated'
import Comments from '@/components/Comments'
import Link from '@/components/Link'
import PageTitle from '@/components/PageTitle'
import SectionContainer from '@/components/SectionContainer'
import Image from '@/components/Image'
import Tag from '@/components/Tag'
import siteMetadata from '@/data/siteMetadata'
import ScrollTopAndComment from '@/components/ScrollTopAndComment'
import { getLocale, getTranslations } from 'next-intl/server'
import { dateLocale } from '@/lib/dateLocale'
import TableOfContents, { type TocItem } from '@/components/TableOfContents'
import { pancakeSeries } from '@/data/series'
import type { PostSeries, PostTranslation } from './postExtras'

const editUrl = (path) => `${siteMetadata.siteRepo}/blob/main/data/${path}`

const postDateTemplate: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}

interface LayoutProps {
  content: CoreContent<Blog>
  authorDetails: CoreContent<Authors>[]
  next?: { path: string; title: string }
  prev?: { path: string; title: string }
  translation?: PostTranslation
  series?: PostSeries
  children: ReactNode
}

export default async function PostLayout({
  content,
  authorDetails,
  next,
  prev,
  translation,
  series,
  children,
}: LayoutProps) {
  const { filePath, path, slug, date, title, tags, readingTime } = content
  const toc = (content.toc ?? []) as TocItem[]
  const minutes = Math.max(1, Math.round(readingTime?.minutes ?? 1))
  const th = await getTranslations('Home')
  const basePath = path.split('/')[0]
  const t = await getTranslations('Post')
  const locale = dateLocale(await getLocale())

  return (
    <SectionContainer>
      <ScrollTopAndComment />
      <article>
        <div className="xl:divide-y xl:divide-gray-200 xl:dark:divide-gray-700">
          <header className="pt-6 xl:pb-6">
            <div className="space-y-1 text-center">
              <dl className="space-y-10">
                <div>
                  <dt className="sr-only">{t('publishedOn')}</dt>
                  <dd className="text-base leading-6 font-medium text-gray-500 dark:text-gray-400">
                    <time dateTime={date}>
                      {new Date(date).toLocaleDateString(locale, postDateTemplate)}
                    </time>
                    <span aria-hidden="true">{` · `}</span>
                    <span>{t('minutesRead', { minutes })}</span>
                  </dd>
                </div>
              </dl>
              <div>
                <PageTitle>{title}</PageTitle>
              </div>
              {translation && (
                <p className="pt-3 text-sm">
                  <Link
                    href={`/${translation.locale}/blog/${translation.slug}`}
                    hrefLang={translation.locale}
                    className="text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium"
                  >
                    {t('readTranslation')} &rarr;
                  </Link>
                </p>
              )}
            </div>
          </header>
          <div className="grid-rows-[auto_1fr] divide-y divide-gray-200 pb-8 xl:grid xl:grid-cols-4 xl:gap-x-6 xl:divide-y-0 dark:divide-gray-700">
            <dl className="pt-6 pb-10 xl:border-b xl:border-gray-200 xl:pt-11 xl:dark:border-gray-700">
              <dt className="sr-only">{t('publishedOn')}</dt>
              <dd>
                <ul className="flex flex-wrap justify-center gap-4 sm:space-x-12 xl:block xl:space-y-8 xl:space-x-0">
                  {authorDetails.map((author) => (
                    <li className="flex items-center space-x-2" key={author.name}>
                      {author.avatar && (
                        <Image
                          src={author.avatar}
                          width={38}
                          height={38}
                          alt="avatar"
                          className="h-10 w-10 rounded-full"
                        />
                      )}
                      <dl className="text-sm leading-5 font-medium whitespace-nowrap">
                        <dt className="sr-only">Name</dt>
                        <dd className="text-gray-900 dark:text-gray-100">{author.name}</dd>
                        <dt className="sr-only">Twitter</dt>
                        <dd>
                          {author.twitter && (
                            <Link
                              href={author.twitter}
                              className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                            >
                              {author.twitter
                                .replace('https://twitter.com/', '@')
                                .replace('https://x.com/', '@')}
                            </Link>
                          )}
                        </dd>
                      </dl>
                    </li>
                  ))}
                </ul>
              </dd>
            </dl>
            <div className="divide-y divide-gray-200 xl:col-span-3 xl:row-span-2 xl:pb-0 dark:divide-gray-700">
              <div className="pt-10 pb-8">
                {series && pancakeSeries.includes(series.key) && (
                  <p className="mb-6 rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
                    {t('disclaimer')}
                  </p>
                )}
                {toc.length > 0 && (
                  <details className="mb-8 rounded-lg border border-gray-200 px-4 py-3 xl:hidden dark:border-gray-700">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {t('toc')}
                    </summary>
                    <div className="pt-3">
                      <TableOfContents toc={toc} title={t('toc')} />
                    </div>
                  </details>
                )}
                <div className="prose dark:prose-invert max-w-none">{children}</div>
              </div>
              {series && series.posts.length > 0 && (
                <div className="py-8">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {t('inSeries', { series: th(`series.${series.key}.title`) })}
                  </h2>
                  <ul className="mt-4 space-y-2">
                    {series.posts.map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={`/blog/${p.slug}`}
                          className="hover:text-primary-600 dark:hover:text-primary-400 text-gray-800 dark:text-gray-200"
                        >
                          {p.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/series/${series.slug}`}
                    className="text-primary-600 hover:text-primary-700 dark:text-primary-400 mt-4 inline-block text-sm font-medium"
                  >
                    {t('seriesAll')} &rarr;
                  </Link>
                </div>
              )}
              <div className="pt-6 pb-6 text-sm text-gray-700 dark:text-gray-300">
                <Link href={editUrl(filePath)}>{t('viewOnGithub')}</Link>
              </div>
              {siteMetadata.comments && (
                <div
                  className="pt-6 pb-6 text-center text-gray-700 dark:text-gray-300"
                  id="comment"
                >
                  <Comments slug={slug} />
                </div>
              )}
            </div>
            <footer>
              <div className="divide-gray-200 text-sm leading-5 font-medium xl:col-start-1 xl:row-start-2 xl:divide-y dark:divide-gray-700">
                {tags && (
                  <div className="py-4 xl:py-8">
                    <h2 className="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
                      {t('tags')}
                    </h2>
                    <div className="flex flex-wrap">
                      {tags.map((tag) => (
                        <Tag key={tag} text={tag} />
                      ))}
                    </div>
                  </div>
                )}
                {(next || prev) && (
                  <div className="flex justify-between py-4 xl:block xl:space-y-8 xl:py-8">
                    {prev && prev.path && (
                      <div>
                        <h2 className="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
                          {t('previousArticle')}
                        </h2>
                        <div className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                          <Link href={`/${prev.path}`}>{prev.title}</Link>
                        </div>
                      </div>
                    )}
                    {next && next.path && (
                      <div>
                        <h2 className="text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
                          {t('nextArticle')}
                        </h2>
                        <div className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                          <Link href={`/${next.path}`}>{next.title}</Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="pt-4 xl:pt-8">
                <Link
                  href={`/${basePath}`}
                  className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                  aria-label={t('backToBlogAria')}
                >
                  {t('backToBlog')}
                </Link>
              </div>
              {toc.length > 0 && (
                <div className="hidden pt-8 xl:sticky xl:top-24 xl:block xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto">
                  <TableOfContents toc={toc} title={t('toc')} />
                </div>
              )}
            </footer>
          </div>
        </div>
      </article>
    </SectionContainer>
  )
}
