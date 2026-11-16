import { readFile } from 'fs/promises'
import path from 'path'
import { ImageResponse } from 'next/og'
import { allBlogs } from 'contentlayer/generated'
import siteMetadata from '@/data/siteMetadata'
import { seriesOf } from '@/data/series'
import vi from 'messages/vi.json'
import en from 'messages/en.json'

// One Open Graph image per post, rendered at build time.
export const dynamic = 'force-static'
export const dynamicParams = false

const seriesTitles = { vi: vi.Home.series, en: en.Home.series }

export function generateStaticParams() {
  return allBlogs
    .filter((post) => !post.draft)
    .map((post) => ({ locale: post.language ?? 'vi', slug: post.slug }))
}

const font = (file: string) => readFile(path.join(process.cwd(), 'assets/fonts', file))

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> }
) {
  const { locale, slug } = await params
  const post = allBlogs.find((p) => p.slug === slug && (p.language ?? 'vi') === locale)
  if (!post) return new Response('Not found', { status: 404 })

  const key = seriesOf(post)
  const seriesTitle = key ? seriesTitles[locale === 'en' ? 'en' : 'vi'][key]?.title : undefined
  const [bold, medium] = await Promise.all([
    font('BeVietnamPro-Bold.ttf'),
    font('BeVietnamPro-Medium.ttf'),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: 'linear-gradient(135deg, #030712 0%, #0b2530 100%)',
          color: '#f9fafb',
          fontFamily: 'Be Vietnam Pro',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, color: '#22d3ee' }}>
          <span style={{ fontWeight: 700 }}>{siteMetadata.headerTitle}</span>
          {seriesTitle && (
            <span style={{ marginLeft: 24, color: '#9ca3af', fontWeight: 500 }}>
              {seriesTitle}
            </span>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: post.title.length > 80 ? 52 : 62,
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          {post.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: '#d1d5db' }}>
          <div
            style={{ width: 56, height: 6, background: '#f59e0b', borderRadius: 3, marginRight: 20 }}
          />
          {siteMetadata.author} · netfull.top
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Be Vietnam Pro', data: bold, weight: 700, style: 'normal' },
        { name: 'Be Vietnam Pro', data: medium, weight: 500, style: 'normal' },
      ],
    }
  )
}
