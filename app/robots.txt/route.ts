import siteMetadata from '@/data/siteMetadata'

export const dynamic = 'force-static'

// We bypass Next.js's typed MetadataRoute.Robots so we can add custom
// directives the Next.js helper doesn't support, namely Content-Signal
// (https://contentsignals.org/) declaring how AI systems may use this site.
//
// Policy chosen for a tech blog:
//   - search=yes     → search engines may index (we want Google traffic)
//   - ai-input=yes   → AI assistants (Claude, ChatGPT, etc.) may quote /
//                       cite posts when answering user questions
//   - ai-train=no    → do not use content to train new foundation models
export function GET() {
  const body = `User-agent: *
Allow: /

# Content Signals — AI usage preferences (https://contentsignals.org/)
Content-Signal: ai-train=no, search=yes, ai-input=yes

Sitemap: ${siteMetadata.siteUrl}/sitemap.xml
Host: ${siteMetadata.siteUrl}
`
  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
