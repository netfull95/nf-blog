import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// Cache the upstream response server-side for 60s so a page full of users
// polling every minute doesn't fan out to addlivetag every minute times N.
// Vercel's fetch-level cache honors `next.revalidate`; our own response is
// cached at the Vercel edge via Cache-Control below.
export const revalidate = 60

const UPSTREAM = 'https://addlivetag.com/api/data_dealxk.php'

type UpstreamDeal = {
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

type TrimmedDeal = {
  id: number
  itemId: number
  shopId: number
  img: string
  title: string
  price: number
  originalPrice: number
  discountPct: number
  amount: number
  sold: number
  saleTime: number
  saleDate: string
  saleSlot: string
}

function trim(d: UpstreamDeal): TrimmedDeal {
  return {
    id: d.id,
    itemId: d.itemid,
    shopId: d.shopid,
    img: d.img,
    title: d.title,
    price: d.price,
    originalPrice: d.original_price,
    discountPct: d.percent,
    amount: d.amount,
    sold: d.sold,
    saleTime: d.sale_time,
    saleDate: d.sale_date,
    saleSlot: d.sale_slot,
  }
}

export async function GET() {
  try {
    const res = await fetch(UPSTREAM, {
      // Impersonate the browser they expect; default Node UA is often rejected.
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        referer: 'https://addlivetag.com/deal.html',
        accept: 'application/json,*/*',
      },
      next: { revalidate: 60 },
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', status: res.status },
        { status: 502 }
      )
    }
    const raw = (await res.json()) as UpstreamDeal[]
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: 'BAD_UPSTREAM_SHAPE' }, { status: 502 })
    }

    // Drop expired deals (sale_time in the past). Addlivetag returns 6000
    // items regardless of expiry — including flash sales that ran days ago —
    // so we filter here so users only see genuinely upcoming/live deals.
    // Small grace window (10 minutes past sale_time) covers the case where
    // the sale is currently happening in its slot.
    const nowSec = Math.floor(Date.now() / 1000)
    const graceSec = 10 * 60
    const items = raw
      .filter((d) => typeof d.sale_time === 'number' && d.sale_time + graceSec > nowSec)
      .map(trim)

    return NextResponse.json(
      {
        items,
        count: items.length,
        totalRaw: raw.length,
        fetchedAt: nowSec,
      },
      {
        headers: {
          // 60s edge cache; SWR another 60s so a slow upstream doesn't stall
          // the whole board.
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
