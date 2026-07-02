import siteMetadata from '@/data/siteMetadata'

export const dynamic = 'force-static'

// RFC 9727 — API Catalog. Served as application/linkset+json per RFC 9264.
// Each linkset entry advertises a public API endpoint along with its
// machine-readable description and human-readable documentation.
export function GET() {
  const base = siteMetadata.siteUrl
  const catalog = {
    linkset: [
      {
        anchor: `${base}/api/tools/fb-info`,
        'service-desc': [
          {
            href: `${base}/api/tools/fb-info`,
            type: 'application/json',
            title:
              'FB Info Lookup API — extract Facebook page metadata (page_id, actor_id, profile image, engagement stats)',
          },
        ],
        'service-doc': [
          {
            href: `${base}/blog/dong-bo-khach-hang-pancake-api-page-customers`,
            type: 'text/html',
            hreflang: 'vi',
            title: 'Documentation (Vietnamese)',
          },
          {
            href: `${base}/en/blog/pancake-page-customers-api-sync-to-crm`,
            type: 'text/html',
            hreflang: 'en',
            title: 'Documentation (English)',
          },
        ],
      },
      {
        anchor: `${base}/api/tools/shopee-shortlink`,
        'service-desc': [
          {
            href: `${base}/api/tools/shopee-shortlink`,
            type: 'application/json',
            title:
              'Shopee Affiliate Shortlink API — generate Shopee Vietnam affiliate links from product URLs',
          },
        ],
      },
    ],
  }

  return new Response(JSON.stringify(catalog, null, 2), {
    headers: { 'Content-Type': 'application/linkset+json; charset=utf-8' },
  })
}
