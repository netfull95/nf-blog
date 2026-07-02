import { NextRequest } from 'next/server'
import { allBlogs } from 'contentlayer/generated'

export const dynamic = 'force-dynamic'

// Serves a blog post as raw markdown for AI agents that request
// Accept: text/markdown. The middleware rewrites /blog/{slug} (and the
// /en/blog/{slug} equivalent) to /api/blog/markdown/{slug} when the content
// negotiation matches, so agents see the same URL as users but get
// machine-friendly markdown back.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  if (!slug) {
    return new Response('Missing slug', { status: 400 })
  }

  const post = allBlogs.find((p) => p.slug === slug)
  if (!post) {
    return new Response('Post not found', { status: 404 })
  }

  // Reconstruct frontmatter so agents see metadata alongside body.
  const fm: Record<string, unknown> = {
    title: post.title,
    date: post.date,
    language: post.language,
    summary: post.summary,
  }
  if (post.lastmod) fm.lastmod = post.lastmod
  if (post.translationKey) fm.translationKey = post.translationKey
  if (Array.isArray(post.tags) && post.tags.length) fm.tags = post.tags

  const frontmatter = Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n')

  const body = `---\n${frontmatter}\n---\n\n${post.body.raw}`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Language': post.language ?? 'vi',
    },
  })
}
