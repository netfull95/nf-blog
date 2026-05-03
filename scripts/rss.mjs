import { writeFileSync, mkdirSync } from 'fs'
import path from 'path'
import { slug } from 'github-slugger'
import { escape } from 'pliny/utils/htmlEscaper.js'
import siteMetadata from '../data/siteMetadata.js'
import tagDataVi from '../app/tag-data.vi.json' with { type: 'json' }
import tagDataEn from '../app/tag-data.en.json' with { type: 'json' }
import { allBlogs } from '../.contentlayer/generated/index.mjs'
import { sortPosts } from 'pliny/utils/contentlayer.js'

const outputFolder = process.env.EXPORT ? 'out' : 'public'

const localeConfig = {
  vi: { tagData: tagDataVi, prefix: '', langTag: 'vi-VN' },
  en: { tagData: tagDataEn, prefix: '/en', langTag: 'en-US' },
}

const generateRssItem = (config, post, prefix) => `
  <item>
    <guid>${config.siteUrl}${prefix}/blog/${post.slug}</guid>
    <title>${escape(post.title)}</title>
    <link>${config.siteUrl}${prefix}/blog/${post.slug}</link>
    ${post.summary && `<description>${escape(post.summary)}</description>`}
    <pubDate>${new Date(post.date).toUTCString()}</pubDate>
    <author>${config.email} (${config.author})</author>
    ${post.tags && post.tags.map((t) => `<category>${t}</category>`).join('')}
  </item>
`

const generateRss = (config, posts, prefix, langTag, feedPath) => `
  <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
      <title>${escape(config.title)}</title>
      <link>${config.siteUrl}${prefix}/blog</link>
      <description>${escape(config.description)}</description>
      <language>${langTag}</language>
      <managingEditor>${config.email} (${config.author})</managingEditor>
      <webMaster>${config.email} (${config.author})</webMaster>
      <lastBuildDate>${new Date(posts[0].date).toUTCString()}</lastBuildDate>
      <atom:link href="${config.siteUrl}${prefix}/${feedPath}" rel="self" type="application/rss+xml"/>
      ${posts.map((post) => generateRssItem(config, post, prefix)).join('')}
    </channel>
  </rss>
`

function writeFeed(relativeDir, fileName, contents) {
  const dir = path.join(outputFolder, relativeDir)
  if (relativeDir) mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, fileName), contents)
}

async function generateRSS(config, allBlogs, page = 'feed.xml') {
  const publishPosts = allBlogs.filter((post) => post.draft !== true)

  for (const [locale, { tagData, prefix, langTag }] of Object.entries(localeConfig)) {
    const localePosts = publishPosts.filter((p) => (p.language ?? 'vi') === locale)
    if (localePosts.length === 0) continue

    const sorted = sortPosts(localePosts)
    const rootDir = locale === 'vi' ? '' : 'en'
    writeFeed(rootDir, page, generateRss(config, sorted, prefix, langTag, page))

    for (const tag of Object.keys(tagData)) {
      const filteredPosts = localePosts.filter(
        (post) => post.tags && post.tags.map((t) => slug(t)).includes(tag)
      )
      if (filteredPosts.length === 0) continue
      const tagDir = path.posix.join(rootDir, 'tags', tag)
      writeFeed(
        tagDir,
        page,
        generateRss(config, sortPosts(filteredPosts), prefix, langTag, `tags/${tag}/${page}`)
      )
    }
  }
}

const rss = () => {
  generateRSS(siteMetadata, allBlogs)
  console.log('RSS feeds generated (vi + en)...')
}
export default rss
