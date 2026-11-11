// Run against a production build: node scripts/check-seo.mjs http://localhost:1995
import assert from 'node:assert/strict'
import { fromHtmlIsomorphic as fromHtml } from 'hast-util-from-html-isomorphic'

const origin = process.argv[2]
assert(origin, 'Provide the origin of the running site')

async function get(path, headers = {}) {
  const response = await fetch(new URL(path, origin), {
    redirect: 'manual',
    headers,
    signal: AbortSignal.timeout(30000),
  })
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`)
  return { response, body: await response.text() }
}

function elements(html, tagName) {
  const result = []
  function visit(node) {
    if (node.tagName === tagName) result.push(node.properties)
    node.children?.forEach(visit)
  }
  visit(fromHtml(html))
  return result
}

function alternates(html) {
  return Object.fromEntries(
    elements(html, 'link')
      .filter((link) => link.hrefLang)
      .map((link) => [link.hrefLang, link.href])
  )
}

const { body: sitemap } = await get('/sitemap.xml')
const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, xml]) => {
  const url = xml.match(/<loc>(.*?)<\/loc>/)?.[1]
  assert(url, 'Sitemap entry is missing loc')
  return { url, languages: alternates(xml.replaceAll('xhtml:link', 'link')) }
})
assert(entries.length > 0, 'Sitemap is empty')
const urls = new Set(entries.map(({ url }) => url))
assert.equal(urls.size, entries.length, 'Duplicate sitemap entries')
const blogLinks = new Set()

for (const { url, languages } of entries) {
  const path = new URL(url).pathname
  const { response, body } = await get(path)
  assert(!/hreflang/i.test(response.headers.get('link') || ''), `${path}: guessed HTTP hreflang`)
  assert(!/noindex/i.test(response.headers.get('x-robots-tag') || ''), `${path}: X-Robots noindex`)
  const canonical = elements(body, 'link').filter((link) => link.rel?.includes('canonical'))
  assert.equal(canonical.length, 1, `${path}: expected one canonical`)
  assert.equal(new URL(canonical[0].href).href, new URL(url).href, `${path}: canonical`)
  assert.deepEqual(alternates(body), languages, `${path}: HTML/sitemap hreflang mismatch`)
  for (const target of Object.values(languages)) {
    assert(urls.has(target), `${path}: alternate absent from sitemap: ${target}`)
    const counterpart = entries.find((entry) => entry.url === target)
    assert.deepEqual(counterpart.languages, languages, `${path}: non-reciprocal hreflang`)
  }
  for (const meta of elements(body, 'meta')) {
    if (['robots', 'googlebot'].includes(meta.name)) {
      assert(!/noindex/i.test(meta.content || ''), `${path}: noindex`)
    }
  }
  for (const link of elements(body, 'a')) {
    if (!link.href) continue
    const target = new URL(link.href, url)
    if (target.origin !== new URL(url).origin) continue
    assert(!target.pathname.startsWith('/en/en/'), `${path}: doubled locale: ${link.href}`)
    if (/^\/(en\/)?blog(\/|$)/.test(target.pathname)) blogLinks.add(target.pathname)
  }
}

for (const path of blogLinks) {
  if (![...urls].some((url) => new URL(url).pathname === path)) await get(path)
}

// Both visitors and crawlers must get the Vietnamese homepage at /.
for (const country of ['VN', 'US', 'DE']) {
  const { body } = await get('/', {
    'x-vercel-ip-country': country,
    'accept-language': 'en-US,en;q=0.9',
    cookie: 'NEXT_LOCALE=en',
  })
  assert.equal(elements(body, 'html')[0].lang, 'vi-VN', `${country}: homepage language`)
}

// Keep the short tool alias canonical and Markdown negotiation working.
for (const prefix of ['', '/en']) {
  const { body } = await get(`${prefix}/sale`)
  const canonical = elements(body, 'link').find((link) => link.rel?.includes('canonical'))
  assert.equal(new URL(canonical.href).pathname, `${prefix}/tools/shopee-deals`)
}
const post = entries.find(({ url }) => new URL(url).pathname.startsWith('/blog/'))
assert(post, 'Expected a Vietnamese blog post')
const markdown = await get(new URL(post.url).pathname, { accept: 'text/markdown' })
assert.match(markdown.response.headers.get('content-type'), /text\/markdown/)
assert(markdown.body.length > 100, 'Empty Markdown response')

console.log(
  `SEO checks passed: ${entries.length} sitemap URLs, ${blogLinks.size} blog link targets, locale stability, aliases and Markdown.`
)
