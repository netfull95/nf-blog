'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { buildAffiliateLinkFromIds } from '@/lib/shopee/buildAffiliateLink'

type Deal = {
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

type ApiResp = { items: Deal[]; count: number; fetchedAt: number }

type PriceTier = 'lt1k' | '1kto9k' | '9kto29k' | 'gte29k'
type Sort = 'random' | 'discount' | 'priceAsc' | 'priceDesc' | 'sold' | 'saleTime'

type SoldRatio = 0 | 20 | 50

type Filters = {
  q: string
  priceTiers: Set<PriceTier>
  discountMin: 0 | 50 | 70 | 90
  stockMin: 0 | 50 | 100
  saleSlots: Set<string>
  soldRatioMin: SoldRatio
  sort: Sort
}

type FavoriteEntry = {
  id: number
  savedAt: number
  // Snapshot of the deal at favorite time so the card still renders when
  // the deal cycles out of the upstream API. When the deal IS in the
  // current fetch, we prefer that (fresher price / sold count).
  snapshot: Deal
}

type Tab = 'all' | 'favorites'

const PRICE_TIER_META: { key: PriceTier; label: string; test: (p: number) => boolean }[] = [
  { key: 'lt1k', label: '≤ 1K', test: (p) => p <= 1_000 },
  { key: '1kto9k', label: '1K – 9K', test: (p) => p > 1_000 && p <= 9_000 },
  { key: '9kto29k', label: '9K – 29K', test: (p) => p > 9_000 && p <= 29_000 },
  { key: 'gte29k', label: '> 29K', test: (p) => p > 29_000 },
]

const REFRESH_INTERVAL_MS = 60_000
const PAGE_SIZE = 60
const FAVORITES_KEY = 'nf-shopee-deals-favorites'
const FAVORITES_MAX = 200

// Tag every deals-board click with sub_id="deals" so we can distinguish this
// traffic from the shopee-shortlink tool (no sub_id) in the affiliate
// dashboard. Actual an_redir assembly lives in `buildAffiliateLinkFromIds`
// so the affiliate ID stays in one place.
function toAffiliateUrl(shopId: number, itemId: number): string {
  return buildAffiliateLinkFromIds(shopId, itemId, ['deals'])
}

const VND = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})

// Simple 32-bit hash so we can shuffle deterministically per random seed.
function seededHash(id: number, seed: number): number {
  let h = (id ^ seed) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

const ShopeeDealsBoard = () => {
  const t = useTranslations('Tools.deals')

  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ok'; data: ApiResp } | { kind: 'error'; msg: string }
  >({ kind: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const [nextRefreshSec, setNextRefreshSec] = useState(REFRESH_INTERVAL_MS / 1000)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [randomSeed, setRandomSeed] = useState(1)

  const [filters, setFilters] = useState<Filters>({
    q: '',
    priceTiers: new Set(),
    discountMin: 0,
    stockMin: 0,
    saleSlots: new Set(),
    soldRatioMin: 0,
    sort: 'discount',
  })

  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([])

  // Load favorites once on mount (client-only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as FavoriteEntry[]
      if (Array.isArray(parsed)) setFavorites(parsed.slice(0, FAVORITES_MAX))
    } catch {
      /* ignore malformed */
    }
  }, [])

  const persistFavorites = useCallback((next: FavoriteEntry[]) => {
    setFavorites(next)
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
    } catch {
      /* quota exceeded or blocked */
    }
  }, [])

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites])

  const toggleFavorite = useCallback(
    (deal: Deal) => {
      setFavorites((prev) => {
        const isFav = prev.some((f) => f.id === deal.id)
        const next = isFav
          ? prev.filter((f) => f.id !== deal.id)
          : [
              { id: deal.id, savedAt: Date.now(), snapshot: deal },
              ...prev,
            ].slice(0, FAVORITES_MAX)
        try {
          localStorage.setItem(FAVORITES_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    []
  )

  const clearFavorites = useCallback(() => {
    if (window.confirm(t('favoritesClearConfirm'))) persistFavorites([])
  }, [persistFavorites, t])

  // ---- Fetch + auto-refresh ----------------------------------------------

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchDeals = useCallback(async (silent = false) => {
    if (!silent) setState({ kind: 'loading' })
    setRefreshing(true)
    try {
      const res = await fetch('/api/tools/shopee-deals', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ApiResp
      setState({ kind: 'ok', data: json })
      setNextRefreshSec(REFRESH_INTERVAL_MS / 1000)
    } catch (e) {
      setState({
        kind: 'error',
        msg: e instanceof Error ? e.message : 'unknown',
      })
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchDeals()
    timerRef.current = setInterval(() => {
      // Pause auto-refresh when tab hidden — user isn't looking, no reason to spam
      if (document.visibilityState === 'visible') void fetchDeals(true)
    }, REFRESH_INTERVAL_MS)
    countdownRef.current = setInterval(() => {
      setNextRefreshSec((s) => (s > 0 ? s - 1 : REFRESH_INTERVAL_MS / 1000))
    }, 1_000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [fetchDeals])

  // ---- Filter + sort ------------------------------------------------------

  const filtered = useMemo(() => {
    if (state.kind !== 'ok') return []

    // Data source depends on active tab. On Favorites tab, prefer the current
    // fresh version of each favorite when it's still in the upstream data
    // (fresher price/sold) and fall back to the snapshot when it's not.
    let arr: Deal[]
    if (activeTab === 'favorites') {
      const byId = new Map(state.data.items.map((d) => [d.id, d]))
      arr = favorites.map((f) => byId.get(f.id) || f.snapshot)
    } else {
      arr = state.data.items
    }

    if (filters.q.trim()) {
      const q = filters.q.trim().toLowerCase()
      arr = arr.filter((d) => d.title.toLowerCase().includes(q))
    }
    if (filters.priceTiers.size > 0) {
      const tiers = PRICE_TIER_META.filter((m) => filters.priceTiers.has(m.key))
      arr = arr.filter((d) => tiers.some((m) => m.test(d.price)))
    }
    if (filters.discountMin > 0) {
      arr = arr.filter((d) => d.discountPct >= filters.discountMin)
    }
    if (filters.stockMin > 0) {
      arr = arr.filter((d) => d.amount >= filters.stockMin)
    }
    if (filters.saleSlots.size > 0) {
      arr = arr.filter((d) => filters.saleSlots.has(d.saleSlot))
    }
    if (filters.soldRatioMin > 0) {
      arr = arr.filter(
        (d) => d.amount > 0 && (d.sold / d.amount) * 100 >= filters.soldRatioMin
      )
    }

    switch (filters.sort) {
      case 'discount':
        arr = [...arr].sort((a, b) => b.discountPct - a.discountPct)
        break
      case 'priceAsc':
        arr = [...arr].sort((a, b) => a.price - b.price)
        break
      case 'priceDesc':
        arr = [...arr].sort((a, b) => b.price - a.price)
        break
      case 'sold':
        arr = [...arr].sort((a, b) => b.sold - a.sold)
        break
      case 'saleTime':
        arr = [...arr].sort((a, b) => a.saleTime - b.saleTime)
        break
      case 'random':
        arr = [...arr].sort(
          (a, b) => seededHash(a.id, randomSeed) - seededHash(b.id, randomSeed)
        )
        break
    }
    return arr
  }, [state, filters, randomSeed, activeTab, favorites])

  // Reset visible count when filters or active tab change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [filters, activeTab])

  // ---- Filter mutators ----------------------------------------------------

  const togglePriceTier = (t: PriceTier) => {
    setFilters((f) => {
      const next = new Set(f.priceTiers)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return { ...f, priceTiers: next }
    })
  }
  const toggleSaleSlot = (s: string) => {
    setFilters((f) => {
      const next = new Set(f.saleSlots)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return { ...f, saleSlots: next }
    })
  }
  const resetFilters = () => {
    setFilters({
      q: '',
      priceTiers: new Set(),
      discountMin: 0,
      stockMin: 0,
      saleSlots: new Set(),
      soldRatioMin: 0,
      sort: 'discount',
    })
  }

  const copyDealLink = async (deal: Deal) => {
    const url = toAffiliateUrl(deal.shopId, deal.itemId)
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(deal.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      /* ignore */
    }
  }

  // Unique slots present in current data — for the slot filter chip row
  const availableSlots = useMemo(() => {
    if (state.kind !== 'ok') return [] as string[]
    const set = new Set<string>()
    state.data.items.forEach((d) => d.saleSlot && set.add(d.saleSlot))
    return Array.from(set).sort()
  }, [state])

  // ---- Render -------------------------------------------------------------

  const totalMatching = filtered.length
  const visibleDeals = filtered.slice(0, visibleCount)

  return (
    <div className="space-y-4">
      {/* Tab bar: All vs Favorites */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        <TabButton
          active={activeTab === 'all'}
          onClick={() => setActiveTab('all')}
        >
          {t('tabAll')}
          {state.kind === 'ok' ? (
            <span className="ml-1.5 text-xs opacity-70">
              ({state.data.count.toLocaleString()})
            </span>
          ) : null}
        </TabButton>
        <TabButton
          active={activeTab === 'favorites'}
          onClick={() => setActiveTab('favorites')}
        >
          ❤️ {t('tabFavorites')}
          <span className="ml-1.5 text-xs opacity-70">({favorites.length})</span>
        </TabButton>
        {activeTab === 'favorites' && favorites.length > 0 && (
          <button
            type="button"
            onClick={clearFavorites}
            className="ml-auto text-xs text-gray-500 underline hover:text-red-500 dark:text-gray-400"
          >
            {t('favoritesClearBtn')}
          </button>
        )}
      </div>

      {/* Top bar: search + refresh countdown */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 sm:w-72"
        />
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {state.kind === 'ok' && (
            <span>
              {t('refreshCountdown', { n: nextRefreshSec })} · {state.data.count}{' '}
              {t('itemsTotal')}
            </span>
          )}
          <button
            type="button"
            onClick={() => void fetchDeals(true)}
            disabled={refreshing}
            className="hover:text-primary-500 dark:hover:text-primary-400 rounded border border-gray-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-gray-700"
          >
            {refreshing ? '⟳' : '🔄'} {t('refreshNow')}
          </button>
        </div>
      </div>

      {/* Filter groups */}
      <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
        {/* Price tiers */}
        <FilterRow label={t('filterPrice')}>
          {PRICE_TIER_META.map((m) => (
            <Chip
              key={m.key}
              active={filters.priceTiers.has(m.key)}
              onClick={() => togglePriceTier(m.key)}
            >
              {m.label}
            </Chip>
          ))}
        </FilterRow>

        {/* Discount */}
        <FilterRow label={t('filterDiscount')}>
          {[0, 50, 70, 90].map((v) => (
            <Chip
              key={v}
              active={filters.discountMin === v}
              onClick={() =>
                setFilters((f) => ({ ...f, discountMin: v as Filters['discountMin'] }))
              }
            >
              {v === 0 ? t('any') : `≥ ${v}%`}
            </Chip>
          ))}
        </FilterRow>

        {/* Stock */}
        <FilterRow label={t('filterStock')}>
          {[0, 50, 100].map((v) => (
            <Chip
              key={v}
              active={filters.stockMin === v}
              onClick={() =>
                setFilters((f) => ({ ...f, stockMin: v as Filters['stockMin'] }))
              }
            >
              {v === 0 ? t('any') : `≥ ${v}`}
            </Chip>
          ))}
        </FilterRow>

        {/* Sold ratio */}
        <FilterRow label={t('filterSold')}>
          {([0, 20, 50] as const).map((v) => (
            <Chip
              key={v}
              active={filters.soldRatioMin === v}
              onClick={() => setFilters((f) => ({ ...f, soldRatioMin: v }))}
            >
              {v === 0 ? t('any') : `≥ ${v}%`}
            </Chip>
          ))}
        </FilterRow>

        {/* Sale slots (multi) */}
        {availableSlots.length > 0 && (
          <FilterRow label={t('filterSlot')}>
            {availableSlots.map((s) => (
              <Chip
                key={s}
                active={filters.saleSlots.has(s)}
                onClick={() => toggleSaleSlot(s)}
              >
                {s}
              </Chip>
            ))}
          </FilterRow>
        )}

        {/* Sort + reset */}
        <FilterRow label={t('sort')}>
          {(
            [
              ['discount', t('sortDiscount')],
              ['priceAsc', t('sortPriceAsc')],
              ['priceDesc', t('sortPriceDesc')],
              ['sold', t('sortSold')],
              ['saleTime', t('sortSaleTime')],
              ['random', t('sortRandom')],
            ] as const
          ).map(([k, label]) => (
            <Chip
              key={k}
              active={filters.sort === k}
              onClick={() => {
                setFilters((f) => ({ ...f, sort: k }))
                if (k === 'random') setRandomSeed(Date.now() & 0xffffffff)
              }}
            >
              {label}
            </Chip>
          ))}
          {filters.sort === 'random' && (
            <button
              type="button"
              onClick={() => setRandomSeed(Date.now() & 0xffffffff)}
              className="ml-2 text-xs text-gray-500 underline hover:text-gray-700 dark:text-gray-400"
            >
              {t('reshuffle')}
            </button>
          )}
          <button
            type="button"
            onClick={resetFilters}
            className="ml-auto text-xs text-gray-500 underline hover:text-red-500 dark:text-gray-400"
          >
            {t('resetFilters')}
          </button>
        </FilterRow>
      </div>

      {/* Counts */}
      {state.kind === 'ok' && (
        <div className="text-sm text-gray-600 dark:text-gray-400">
          🔥 {t('matched', { n: totalMatching.toLocaleString() })}
          {totalMatching > visibleCount ? ` · ${t('showing', { n: visibleCount })}` : null}
        </div>
      )}

      {/* States */}
      {state.kind === 'loading' && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40">
          {t('loading')}
        </div>
      )}
      {state.kind === 'error' && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {t('errorLoading')}: {state.msg}
        </div>
      )}

      {/* Grid */}
      {state.kind === 'ok' && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleDeals.map((d) => (
              <DealCard
                key={d.id}
                deal={d}
                copied={copiedId === d.id}
                onCopy={() => void copyDealLink(d)}
                isFavorite={favoriteIds.has(d.id)}
                onToggleFavorite={() => toggleFavorite(d)}
                t={t}
              />
            ))}
          </div>
          {totalMatching === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40">
              {activeTab === 'favorites' && favorites.length === 0
                ? t('favoritesEmpty')
                : t('empty')}
            </div>
          )}
          {totalMatching > visibleCount && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:border-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                {t('loadMore', { n: Math.min(PAGE_SIZE, totalMatching - visibleCount) })}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---- Sub-components ------------------------------------------------------

const TabButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    className={
      'border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
      (active
        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
        : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200')
    }
  >
    {children}
  </button>
)

const FilterRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2">
    <span className="w-16 shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400">
      {label}
    </span>
    <div className="flex flex-wrap items-center gap-1.5">{children}</div>
  </div>
)

const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    className={
      'rounded-full border px-3 py-1 text-xs transition-colors ' +
      (active
        ? 'border-primary-500 bg-primary-500 text-white'
        : 'border-gray-300 bg-white text-gray-700 hover:border-primary-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300')
    }
  >
    {children}
  </button>
)

const DealCard = ({
  deal,
  copied,
  onCopy,
  isFavorite,
  onToggleFavorite,
  t,
}: {
  deal: Deal
  copied: boolean
  onCopy: () => void
  isFavorite: boolean
  onToggleFavorite: () => void
  t: ReturnType<typeof useTranslations<'Tools.deals'>>
}) => {
  const affiliateUrl = toAffiliateUrl(deal.shopId, deal.itemId)
  const soldPct =
    deal.amount > 0 ? Math.min(100, Math.round((deal.sold / deal.amount) * 100)) : 0
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
      {/* Image with discount badge overlay */}
      <div className="relative aspect-square w-full bg-gray-100 dark:bg-gray-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={deal.img}
          alt={deal.title}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
        {/* Favorite toggle — top-left, opposite the discount badge */}
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? t('unfavorite') : t('favorite')}
          title={isFavorite ? t('unfavorite') : t('favorite')}
          className="absolute top-1 left-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-base backdrop-blur transition-colors hover:bg-white dark:bg-black/60 dark:hover:bg-black/80"
        >
          {isFavorite ? '❤️' : '🤍'}
        </button>
        {deal.discountPct > 0 && (
          <span className="absolute top-1 right-1 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            -{deal.discountPct}%
          </span>
        )}
        <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          🕐 {deal.saleSlot} · {deal.saleDate}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-2.5">
        <p
          className="line-clamp-2 min-h-[2.5em] text-xs text-gray-900 dark:text-gray-100"
          title={deal.title}
        >
          {deal.title}
        </p>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
            {VND.format(deal.price)}
          </span>
          {deal.originalPrice > deal.price && (
            <span className="text-[10px] text-gray-400 line-through">
              {VND.format(deal.originalPrice)}
            </span>
          )}
        </div>

        {/* Stock/sold bar */}
        <div className="mt-1.5 space-y-0.5">
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>
              {deal.sold}/{deal.amount} {t('soldSuffix')}
            </span>
            <span>{soldPct}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full bg-orange-500"
              style={{ width: `${soldPct}%` }}
            />
          </div>
        </div>

        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:text-primary-500 dark:border-gray-700 dark:text-gray-200"
          >
            {copied ? t('copied') : t('copyLink')}
          </button>
          <a
            href={affiliateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded bg-primary-500 px-2 py-1 text-center text-[11px] font-medium text-white hover:bg-primary-600"
          >
            {t('buyNow')}
          </a>
        </div>
      </div>
    </div>
  )
}

export default ShopeeDealsBoard
