import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const revalidate = 60

// Addlivetag's product-offer.php proxies Shopee's affiliate Open API
// `productOfferV2` — a paginated list of products enrolled in the affiliate
// program, sorted by whatever we ask (sortType=2 = highest sales).
// - CORS-enabled but we proxy anyway to trim + cap fan-out
// - Rate limit ~1000/min from their DB cache, ~100/min live
// - Docs: https://data.addlivetag.com/shopee/#product-offer
const UPSTREAM_BASE = 'https://data.addlivetag.com/offers/product-offer.php'

// Fetch top pages sorted by sales, merge into a single list. 4×50 = 200
// items is enough breadth for a trending board and fits inside the live
// rate-limit budget with room to spare.
const PAGES = 4
const LIMIT_PER_PAGE = 50
const SORT_TYPE_SALES = 2

type UpstreamProduct = {
  itemId: number
  name: string
  link: string
  image: string
  catIds: number[]
  commissionRate: number
  price: number
  priceMin: number
  priceMax: number
  sales: number
  rating: number
  shopId: number
  shopName: string
  startTime: number
  endTime: number
}

type UpstreamResp = {
  status: string
  dataSource: string
  page: number
  limit: number
  hasNextPage: boolean
  count: number
  products: UpstreamProduct[]
  stale?: boolean
  warning?: string
}

// Same shape as the deals board client expects. Fields that product-offer.php
// doesn't provide (originalPrice, discountPct, sold, saleSlot, saleDate,
// saleTime, amount) are omitted — the client treats them as optional and
// hides the corresponding UI when missing.
type TrimmedItem = {
  id: number
  itemId: number
  shopId: number
  img: string
  title: string
  price: number
  amount: number // kept for type compat; product-offer has no stock, use 0
  sold: number // maps to lifetime `sales` from upstream
  saleTime: number // maps to offer startTime
  saleDate: string // empty — no flash-sale slot info in this source
  saleSlot: string // empty
  rating?: number
  shopName?: string
}

function trim(p: UpstreamProduct): TrimmedItem {
  return {
    id: p.itemId,
    itemId: p.itemId,
    shopId: p.shopId,
    img: p.image,
    title: p.name,
    price: p.price,
    amount: 0,
    sold: p.sales ?? 0,
    saleTime: p.startTime ?? 0,
    saleDate: '',
    saleSlot: '',
    rating: p.rating > 0 ? p.rating : undefined,
    shopName: p.shopName || undefined,
  }
}

export async function GET() {
  try {
    // Fetch pages in parallel. Each addlivetag call is ~1-2s; parallel keeps
    // total wall time near the slowest page rather than sum.
    const pageResults = await Promise.all(
      Array.from({ length: PAGES }, (_, i) => i + 1).map(async (page) => {
        const url = `${UPSTREAM_BASE}?sortType=${SORT_TYPE_SALES}&limit=${LIMIT_PER_PAGE}&page=${page}`
        try {
          const res = await fetch(url, {
            headers: {
              'user-agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
              referer: 'https://data.addlivetag.com/shopee/',
              accept: 'application/json,*/*',
            },
            next: { revalidate: 60 },
          })
          if (!res.ok) return null
          return (await res.json()) as UpstreamResp
        } catch {
          return null
        }
      })
    )

    const okPages = pageResults.filter((r): r is UpstreamResp => r?.status === 'success')
    if (okPages.length === 0) {
      return NextResponse.json({ error: 'UPSTREAM_ERROR' }, { status: 502 })
    }

    // Merge + dedupe by itemId (in case pages overlap under concurrent
    // upstream cache writes).
    const seen = new Set<number>()
    const items: TrimmedItem[] = []
    for (const page of okPages) {
      for (const p of page.products || []) {
        if (seen.has(p.itemId)) continue
        seen.add(p.itemId)
        items.push(trim(p))
      }
    }

    return NextResponse.json(
      {
        items,
        count: items.length,
        fetchedAt: Math.floor(Date.now() / 1000),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
        },
      }
    )
  } catch (e) {
    return NextResponse.json(
      {
        error: 'FETCH_FAILED',
        message: e instanceof Error ? e.message : 'unknown',
      },
      { status: 502 }
    )
  }
}
