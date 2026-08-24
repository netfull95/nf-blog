import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const revalidate = 60

// Combines THREE addlivetag sources to maximize product breadth:
//
//   product-offer.php  → top sellers cross-shop (sortType=2)
//   shop-offer.php     → top affiliate shops → shop-products.php per shop
//   data_dealxk.php    → flash-sale dataset (~6000 items, discount + slot info)
//
// data_dealxk items may have expired flash-sale windows (upstream crawler
// paused since 2026-08), but the products themselves still exist on Shopee
// and the affiliate links still credit — no reason to hide them from a
// trending board. Bonus: this source carries discount%, originalPrice,
// amount, sold, saleSlot, saleDate that product-offer/shop-products lack.
//
// Fan-out per cache-miss:
//   4 pages product-offer  (top sellers)
//   4 pages shop-offer     (candidate shops)
//   N shop-products calls  (one per selected top shop)
//   1 call data_dealxk     (single ~4MB dump; cached at Vercel edge for 60s)
//
// addlivetag rate limits: ~100/min live, ~1000/min from their DB cache.
// Since they cache 10-30 min, most of our fan-out hits their DB, not the
// upstream Shopee API. Our own 60s edge cache means at most one full batch
// per minute per region.
//
// Docs:
//   https://data.addlivetag.com/shopee/#product-offer
//   https://data.addlivetag.com/shopee/#shop-offer
//   https://data.addlivetag.com/shopee/#shop-products

const PRODUCT_OFFER_URL = 'https://data.addlivetag.com/offers/product-offer.php'
const SHOP_OFFER_URL = 'https://data.addlivetag.com/offers/shop-offer.php'
const SHOP_PRODUCTS_URL = 'https://data.addlivetag.com/offers/shop-products.php'
const DATA_DEALXK_URL = 'https://addlivetag.com/api/data_dealxk.php'

const PRODUCT_OFFER_PAGES = 4 // 200 raw top sellers
const SHOP_OFFER_PAGES = 4 // 200 raw shop candidates
const TOP_SHOPS_TO_QUERY = 40 // fan-out; shop-products caches 10min upstream
const LIMIT_PER_PAGE = 50
const HARD_CAP = 2500 // bounded response — 2500 items × ~200B ≈ 500KB
const SORT_TYPE_SALES = 2

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
const REFERER = 'https://data.addlivetag.com/shopee/'

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
type UpstreamShop = {
  shopId: number
  name: string
  type: number[]
  commissionRate: number
  rating: number
  remainingBudget: number // 0=unlimited, 3=>50%, 2=<50%, 1=<30%
  image: string
  link: string
  startTime: number
  endTime: number
}

type ProductOfferResp = { status: string; products?: UpstreamProduct[] }
type ShopOfferResp = { status: string; shops?: UpstreamShop[] }
type ShopProductsResp = { status: string; products?: UpstreamProduct[] }

// Legacy flash-sale dataset — different naming convention (snake_case).
type UpstreamDealXk = {
  id: number
  src_id: string
  itemid: number
  shopid: number
  img: string
  title: string
  link: string
  shop_name: string | null
  price: number
  original_price: number
  percent: number
  amount: number
  sold: number
  sale_time: number
  time_raw: string
  sale_date: string
  sale_slot: string
  created_at: string
  updated_at: string
}

// Same shape as before — client-facing fields; optionals stay unset when
// upstream doesn't provide them. data_dealxk items populate the discount +
// slot fields that product-offer/shop-products don't have.
type TrimmedItem = {
  id: number
  itemId: number
  shopId: number
  img: string
  title: string
  price: number
  amount: number
  sold: number
  saleTime: number
  saleDate: string
  saleSlot: string
  rating?: number
  shopName?: string
  originalPrice?: number
  discountPct?: number
}

function trimProduct(p: UpstreamProduct): TrimmedItem {
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

function trimDealXk(d: UpstreamDealXk): TrimmedItem {
  return {
    id: d.itemid,
    itemId: d.itemid,
    shopId: d.shopid,
    img: d.img,
    title: d.title,
    price: d.price,
    amount: d.amount ?? 0,
    sold: d.sold ?? 0,
    saleTime: d.sale_time ?? 0,
    saleDate: d.sale_date || '',
    saleSlot: d.sale_slot || '',
    shopName: d.shop_name || undefined,
    originalPrice:
      d.original_price && d.original_price > d.price ? d.original_price : undefined,
    discountPct: d.percent && d.percent > 0 ? d.percent : undefined,
  }
}

const HEADERS = {
  'user-agent': UA,
  referer: REFERER,
  accept: 'application/json,*/*',
}

// Fail-open helper — returns null on any error so one flaky page doesn't
// take down the whole batch. Caller filters nulls.
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function fetchProductOfferPage(page: number): Promise<UpstreamProduct[]> {
  const r = await fetchJson<ProductOfferResp>(
    `${PRODUCT_OFFER_URL}?sortType=${SORT_TYPE_SALES}&limit=${LIMIT_PER_PAGE}&page=${page}`
  )
  return r?.status === 'success' && r.products ? r.products : []
}
async function fetchShopOfferPage(page: number): Promise<UpstreamShop[]> {
  const r = await fetchJson<ShopOfferResp>(
    `${SHOP_OFFER_URL}?limit=${LIMIT_PER_PAGE}&page=${page}`
  )
  return r?.status === 'success' && r.shops ? r.shops : []
}
async function fetchShopProductsPage(shopId: number): Promise<UpstreamProduct[]> {
  const r = await fetchJson<ShopProductsResp>(
    `${SHOP_PRODUCTS_URL}?shopId=${shopId}&limit=${LIMIT_PER_PAGE}&page=1`
  )
  return r?.status === 'success' && r.products ? r.products : []
}

async function fetchDataDealXk(): Promise<UpstreamDealXk[]> {
  const r = await fetchJson<UpstreamDealXk[]>(DATA_DEALXK_URL)
  return Array.isArray(r) ? r : []
}

export async function GET() {
  try {
    // Phase 1: three parallel bulk fetches.
    const [productOfferPages, shopOfferPages, dealXkItems] = await Promise.all([
      Promise.all(
        Array.from({ length: PRODUCT_OFFER_PAGES }, (_, i) => i + 1).map(
          fetchProductOfferPage
        )
      ),
      Promise.all(
        Array.from({ length: SHOP_OFFER_PAGES }, (_, i) => i + 1).map(fetchShopOfferPage)
      ),
      fetchDataDealXk(),
    ])

    const topProducts = productOfferPages.flat()
    const allShops = shopOfferPages.flat()

    // Pick the highest-value shops to fan out to. remainingBudget==1 means
    // <30% budget left → likely to run out mid-day; skip. Rank by rating
    // then commission rate. Dedupe by shopId in case pages overlap.
    const seenShop = new Set<number>()
    const rankedShops = allShops
      .filter((s) => s.remainingBudget !== 1)
      .filter((s) => {
        if (seenShop.has(s.shopId)) return false
        seenShop.add(s.shopId)
        return true
      })
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating
        return b.commissionRate - a.commissionRate
      })
      .slice(0, TOP_SHOPS_TO_QUERY)

    // Phase 2: fetch shop-products for each selected shop in parallel.
    const shopProductLists = await Promise.all(
      rankedShops.map((s) => fetchShopProductsPage(s.shopId))
    )

    // Merge + dedupe by itemId, capped. Product-offer + shop-products go
    // first (fresher, richer rating data) so an id appearing in both wins
    // the product-offer variant. data_dealxk items add breadth + carry the
    // extra discount / slot fields when they weren't already seen.
    const seenItem = new Set<number>()
    const items: TrimmedItem[] = []

    for (const p of [...topProducts, ...shopProductLists.flat()]) {
      if (items.length >= HARD_CAP) break
      if (seenItem.has(p.itemId)) continue
      seenItem.add(p.itemId)
      items.push(trimProduct(p))
    }
    for (const d of dealXkItems) {
      if (items.length >= HARD_CAP) break
      if (seenItem.has(d.itemid)) continue
      seenItem.add(d.itemid)
      items.push(trimDealXk(d))
    }

    if (items.length === 0) {
      return NextResponse.json({ error: 'UPSTREAM_ERROR' }, { status: 502 })
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
