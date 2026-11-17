import { allBlogs } from 'contentlayer/generated'
import { sortPosts } from 'pliny/utils/contentlayer'
import siteMetadata from '@/data/siteMetadata'

// llms.txt (https://llmstxt.org): an index of posts for AI agents, each linking
// to its raw Markdown served by app/api/blog/markdown.
export const dynamic = 'force-static'

const sections = [
  { locale: 'vi', title: 'Bài viết tiếng Việt' },
  { locale: 'en', title: 'English posts' },
]

export function GET() {
  const posts = sortPosts(allBlogs.filter((p) => !p.draft))
  const lines = [`# ${siteMetadata.title}`, '', `> ${siteMetadata.description}`, '']
  for (const { locale, title } of sections) {
    lines.push(`## ${title}`, '')
    posts
      .filter((p) => (p.language ?? 'vi') === locale)
      .forEach((p) => {
        const url = `${siteMetadata.siteUrl}/api/blog/markdown/${p.slug}`
        lines.push(`- [${p.title}](${url})${p.summary ? `: ${p.summary}` : ''}`)
      })
    lines.push('')
  }
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
