'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { buildAffiliateLinkFromIds } from '@/lib/shopee/buildAffiliateLink'
import { sanitizeShopeeUrl } from '@/lib/shopee/sanitizeShopeeUrl'
import { isShortlinkHost } from '@/lib/shopee/expandShortlink'
import {
  addToHistory as sharedAddToHistory,
  fetchProductPreview,
  loadHistory,
  newHistoryId,
  saveHistory,
  type PreviewFields,
  type SavedShortlink,
} from '@/lib/shopee/history'

type Deal = {
  id: number
  itemId: number
  shopId: number
  img: string
  title: string
  price: number
  sold: number
  saleTime: number
  // Optional — only present when upstream provides them. Product-offer
  // source (current) omits discount/stock/slot fields.
  originalPrice?: number
  discountPct?: number
  amount?: number
  saleDate?: string
  saleSlot?: string
  rating?: number
  shopName?: string
}

type ApiResp = {
  items: Deal[]
  count: number
  fetchedAt: number
}

type PriceTier = 'lt1k' | '1kto9k' | '9kto29k' | 'gte29k'
type Sort = 'random' | 'priceAsc' | 'priceDesc' | 'sold'

type RatingMin = 0 | 4 | 4.5 | 4.8

type Filters = {
  q: string
  priceTiers: Set<PriceTier>
  ratingMin: RatingMin
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

type Tab = 'all' | 'favorites' | 'mine'

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
const FILTERS_KEY = 'nf-shopee-deals-filters'

const DEFAULT_FILTERS: Filters = {
  q: '',
  priceTiers: new Set(),
  ratingMin: 0,
  sort: 'sold',
}
// After user's sort is applied on the "Tất cả" tab, take the top N items
// and reshuffle just those — user's sort still decides WHICH N items get
// surfaced (e.g. top 200 by sales), but their order within the top is
// randomized on every fetch so the board feels fresh.
const RESHUFFLE_TOP = 200

// JSON can't round-trip Set — convert to/from arrays for localStorage.
type FiltersWire = Omit<Filters, 'priceTiers'> & {
  priceTiers: PriceTier[]
}
function filtersToWire(f: Filters): FiltersWire {
  return { ...f, priceTiers: Array.from(f.priceTiers) }
}
function filtersFromWire(w: FiltersWire): Filters {
  return { ...w, priceTiers: new Set(w.priceTiers) }
}

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

// Convert a saved shortlink history entry into a Deal so it renders in the
// same grid alongside API items. Returns null if the record can't be mapped
// (missing itemId/shopId — legacy entries from before we saved those).
function savedToDeal(s: SavedShortlink): Deal | null {
  if (!s.itemId || !s.shopId) return null
  const itemId = Number(s.itemId)
  const shopId = Number(s.shopId)
  if (!Number.isFinite(itemId) || !Number.isFinite(shopId)) return null
  return {
    id: itemId,
    itemId,
    shopId,
    img: s.imageUrl || '',
    title: s.productName || s.cleanUrl,
    price: s.price ?? 0,
    sold: s.sales ?? 0,
    saleTime: Math.floor(s.createdAt / 1000),
    originalPrice: s.originalPrice,
    discountPct: s.discountPercent,
    rating: s.rating,
    shopName: s.shopName,
  }
}

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

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  // Track whether we've loaded persisted filters — until then, skip writing
  // to localStorage so we don't clobber saved state with the default before
  // hydration completes.
  const filtersLoadedRef = useRef(false)

  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([])
  const [myLinks, setMyLinks] = useState<SavedShortlink[]>([])
  // itemIds of products the user just created via the URL input this session.
  // Rendered on the "Tất cả" tab pinned above all filter/sort results — so
  // the new card is always visible right after paste, regardless of active
  // filters. Session-only (myLinks localStorage covers cross-session).
  const [pinnedIds, setPinnedIds] = useState<number[]>([])

  // URL-generation state — the input value lives in `filters.q` (single
  // field for both search and URL paste; see `isUrl` below).
  const [urlSubmitting, setUrlSubmitting] = useState(false)
  const [urlMessage, setUrlMessage] = useState<
    { kind: 'ok' | 'err'; text: string } | null
  >(null)

  // Detect whether the input currently contains a Shopee URL we can process
  // through the shortlink pipeline. Accepts EITHER:
  //   - A shortlink host (s.shopee.vn / shp.ee / …) — server will expand it
  //   - A canonical product URL sanitizeShopeeUrl can parse directly
  // When true, we switch the field's behavior from "search filter" to
  // "generate affiliate link" — hint text + CTA button appear, and the
  // filter pipeline stops narrowing the board.
  const isUrl = useMemo(() => {
    const trimmed = filters.q.trim()
    if (!trimmed) return false
    try {
      const u = new URL(trimmed)
      if (isShortlinkHost(u.hostname.toLowerCase())) return true
    } catch {
      /* not a URL at all */
    }
    return sanitizeShopeeUrl(trimmed).ok
  }, [filters.q])

  // Load shortlink history once (shared with /tools/shopee-shortlink)
  useEffect(() => {
    setMyLinks(loadHistory())
  }, [])

  // Load persisted filters once on mount (client-only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as FiltersWire
        setFilters(filtersFromWire(parsed))
      }
    } catch {
      /* ignore malformed */
    }
    filtersLoadedRef.current = true
  }, [])

  // Persist filters on any change (after initial hydration only)
  useEffect(() => {
    if (!filtersLoadedRef.current) return
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filtersToWire(filters)))
    } catch {
      /* quota exceeded / blocked */
    }
  }, [filters])

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
      // Bump the random-sort seed on every successful fetch so users on
      // sort=random (default) see a reshuffled order after each 60s tick.
      // No-op visually for other sort modes.
      setRandomSeed(Date.now() & 0xffffffff)
    } catch (e) {
      setState({
        kind: 'error',
        msg: e instanceof Error ? e.message : 'unknown',
      })
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Auto-refresh is skipped when the user has scrolled past the initial
  // fold — they're actively browsing and a background reshuffle would move
  // cards out from under them. Threshold picked to cover the tab bar +
  // input + one filter row.
  const SCROLL_PAUSE_PX = 300
  const shouldAutoRefresh = () =>
    typeof window !== 'undefined' &&
    document.visibilityState === 'visible' &&
    window.scrollY < SCROLL_PAUSE_PX

  useEffect(() => {
    void fetchDeals()
    timerRef.current = setInterval(() => {
      if (shouldAutoRefresh()) void fetchDeals(true)
    }, REFRESH_INTERVAL_MS)
    countdownRef.current = setInterval(() => {
      // Freeze the visible countdown while paused so the UI matches reality
      // (no misleading "auto-refresh in 3s" if we won't actually refresh).
      if (!shouldAutoRefresh()) return
      setNextRefreshSec((s) => (s > 0 ? s - 1 : REFRESH_INTERVAL_MS / 1000))
    }, 1_000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [fetchDeals])

  // ---- Filter + sort ------------------------------------------------------

  const filtered = useMemo(() => {
    if (state.kind !== 'ok' && activeTab !== 'mine') return []

    // Data source depends on active tab.
    //   all       → upstream trending items + saved localStorage links merged
    //   favorites → favorites list, preferring current upstream data (fresher)
    //   mine      → shortlink history from localStorage (works offline)
    let arr: Deal[]
    if (activeTab === 'favorites') {
      const byId = new Map(
        state.kind === 'ok' ? state.data.items.map((d) => [d.id, d] as const) : []
      )
      arr = favorites.map((f) => byId.get(f.id) || f.snapshot)
    } else if (activeTab === 'mine') {
      arr = myLinks.map(savedToDeal).filter((d): d is Deal => d !== null)
    } else {
      // "Tất cả": union of upstream + myLinks, deduped by id. Upstream data
      // wins on conflict (fresher price/rating/sold) while myLinks entries
      // not present upstream still appear in the main board.
      const upstream = state.kind === 'ok' ? state.data.items : []
      const myLinkDeals = myLinks
        .map(savedToDeal)
        .filter((d): d is Deal => d !== null)
      const seen = new Set<number>()
      arr = []
      for (const d of [...upstream, ...myLinkDeals]) {
        if (seen.has(d.id)) continue
        seen.add(d.id)
        arr.push(d)
      }
    }

    // Only apply search-filter when the input is TEXT (not a Shopee URL).
    // URL-mode should show the full board so user can review then decide
    // to hit "Tạo link" without the board flashing empty.
    if (!isUrl && filters.q.trim()) {
      const q = filters.q.trim().toLowerCase()
      arr = arr.filter((d) => d.title.toLowerCase().includes(q))
    }
    if (filters.priceTiers.size > 0) {
      const tiers = PRICE_TIER_META.filter((m) => filters.priceTiers.has(m.key))
      arr = arr.filter((d) => tiers.some((m) => m.test(d.price)))
    }
    if (filters.ratingMin > 0) {
      arr = arr.filter((d) => (d.rating ?? 0) >= filters.ratingMin)
    }

    switch (filters.sort) {
      case 'priceAsc':
        arr = [...arr].sort((a, b) => a.price - b.price)
        break
      case 'priceDesc':
        arr = [...arr].sort((a, b) => b.price - a.price)
        break
      case 'sold':
        arr = [...arr].sort((a, b) => b.sold - a.sold)
        break
      case 'random':
        arr = [...arr].sort(
          (a, b) => seededHash(a.id, randomSeed) - seededHash(b.id, randomSeed)
        )
        break
    }

    // Reshuffle-top on "Tất cả": take the first RESHUFFLE_TOP items by
    // user's sort, randomize order within just that band, then keep the
    // remaining items (position RESHUFFLE_TOP+ onwards) in their sorted
    // order below. Every successful fetch bumps randomSeed (see fetchDeals)
    // so the visible top reshuffles each refresh — while total item count
    // is preserved. Skip for 'random' sort (already fully shuffled).
    if (
      activeTab === 'all' &&
      filters.sort !== 'random' &&
      arr.length > RESHUFFLE_TOP
    ) {
      const top = arr.slice(0, RESHUFFLE_TOP)
      const rest = arr.slice(RESHUFFLE_TOP)
      const shuffledTop = [...top].sort(
        (a, b) => seededHash(a.id, randomSeed) - seededHash(b.id, randomSeed)
      )
      arr = [...shuffledTop, ...rest]
    }

    // Pin newly-created items to the very top of the "Tất cả" tab, bypassing
    // filters, sort, and the reshuffle above. Ensures a just-generated card
    // is instantly visible after paste even if the active filter would
    // exclude it or the shuffle would bury it.
    if (activeTab === 'all' && pinnedIds.length > 0) {
      const allItems = state.kind === 'ok' ? state.data.items : []
      const pinnedSet = new Set(pinnedIds)
      const pinned = pinnedIds
        .map((id) => allItems.find((d) => d.id === id))
        .filter((d): d is Deal => d !== undefined)
      const rest = arr.filter((d) => !pinnedSet.has(d.id))
      arr = [...pinned, ...rest]
    }

    return arr
  }, [state, filters, randomSeed, activeTab, favorites, myLinks, isUrl, pinnedIds])

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
  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS)
    try {
      localStorage.removeItem(FILTERS_KEY)
    } catch {
      /* ignore */
    }
  }

  // Submit the Shopee URL currently in the input through the same pipeline
  // as /tools/shopee-shortlink (server handles both canonical URLs AND
  // shortlink expansion). On success:
  //   1. Save entry to shared history (visible in "Của tôi" tab + splink tool)
  //   2. Prepend the created deal to state.data.items so it appears at
  //      the top of the "Tất cả" list — no auto-tab-switch
  //   3. Clear the input so the URL doesn't linger in filter localStorage
  //
  // No-op when the input isn't a URL — Enter on plain text does nothing
  // (search filter is already live via onChange).
  const submitUrl = async () => {
    const url = filters.q.trim()
    if (!url || !isUrl) return
    setUrlSubmitting(true)
    setUrlMessage(null)
    try {
      const res = await fetch('/api/tools/shopee-shortlink', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        shortLink?: string
        longLink?: string
        shopId?: string
        itemId?: string
        productName?: string
        retryAfterSec?: number
      }
      if (!res.ok || !json.shortLink) {
        setUrlMessage({ kind: 'err', text: t('urlErrorGeneric') })
        return
      }
      // Enrich the entry with product info from addlivetag BEFORE saving,
      // so the card shows image/title/price on first render instead of an
      // ugly URL-as-title placeholder. Preview fetch is best-effort —
      // on failure we still save the minimal entry and mark it 'failed'
      // so mount-time refetches don't hammer the API.
      const preview: PreviewFields | null = json.itemId
        ? await fetchProductPreview(json.itemId)
        : null
      const hasPreview = preview !== null && Object.keys(preview).length > 0
      const entry: SavedShortlink = {
        id: newHistoryId(),
        shortLink: json.shortLink,
        cleanUrl: json.longLink || '',
        shopId: json.shopId,
        itemId: json.itemId,
        productName: json.productName || preview?.productName,
        createdAt: Date.now(),
        ...(preview || {}),
        previewStatus: hasPreview ? undefined : 'failed',
      }
      // Shared history — dedupe + prepend + cap (also visible in splink tool).
      setMyLinks((prev) => {
        const next = sharedAddToHistory(entry, prev)
        saveHistory(next)
        return next
      })
      // Push the just-created product to the top of the main board too, so
      // the user sees it without switching tabs. Also pin the itemId so
      // filter/sort don't shuffle it away.
      const asDeal = savedToDeal(entry)
      if (asDeal) {
        setState((s) => {
          if (s.kind !== 'ok') return s
          const items = [asDeal, ...s.data.items.filter((d) => d.id !== asDeal.id)]
          return { kind: 'ok', data: { ...s.data, items, count: items.length } }
        })
        setPinnedIds((prev) => [asDeal.id, ...prev.filter((id) => id !== asDeal.id)].slice(0, 10))
      }
      setFilters((f) => ({ ...f, q: '' }))
      setUrlMessage({ kind: 'ok', text: t('urlSaved') })
      setTimeout(() => setUrlMessage(null), 3000)
    } catch {
      setUrlMessage({ kind: 'err', text: t('urlErrorNetwork') })
    } finally {
      setUrlSubmitting(false)
    }
  }

  // Infinite-scroll sentinel — IntersectionObserver bumps visibleCount by
  // PAGE_SIZE whenever it enters the viewport, up to the current total.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((n) => n + PAGE_SIZE)
        }
      },
      { rootMargin: '400px 0px' } // preload a bit before the user hits the bottom
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [filtered.length])

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
        <TabButton active={activeTab === 'mine'} onClick={() => setActiveTab('mine')}>
          🔗 {t('tabMine')}
          <span className="ml-1.5 text-xs opacity-70">({myLinks.length})</span>
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

      {/* Unified input row — one field does double duty:
             - text mode: live-filter the visible cards by title (filters.q)
             - URL mode:  show CTA + generate affiliate link via submitUrl
          Detection is derived (isUrl); the same value drives both. */}
      <div className="space-y-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:flex-1">
            <span
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
              aria-hidden
            >
              {isUrl ? '🔗' : '🔍'}
            </span>
            <input
              type="text"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && isUrl) {
                  e.preventDefault()
                  void submitUrl()
                }
              }}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-md border border-gray-300 bg-white py-2 pr-3 pl-9 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              spellCheck={false}
            />
          </div>
          {isUrl && (
            <button
              type="button"
              onClick={submitUrl}
              disabled={urlSubmitting}
              className="bg-primary-500 hover:bg-primary-600 inline-flex shrink-0 items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {urlSubmitting ? t('urlSubmitting') : t('urlSubmit')}
            </button>
          )}
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
        {filters.q.trim() ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isUrl ? t('hintUrlMode') : t('hintSearchMode')}
          </p>
        ) : null}
        {urlMessage ? (
          <p
            className={
              'text-xs ' +
              (urlMessage.kind === 'ok'
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400')
            }
          >
            {urlMessage.text}
          </p>
        ) : null}
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

        {/* Rating */}
        <FilterRow label={t('filterRating')}>
          {([0, 4, 4.5, 4.8] as const).map((v) => (
            <Chip
              key={v}
              active={filters.ratingMin === v}
              onClick={() => setFilters((f) => ({ ...f, ratingMin: v }))}
            >
              {v === 0 ? t('any') : `⭐ ≥ ${v}`}
            </Chip>
          ))}
        </FilterRow>

        {/* Sort + reset */}
        <FilterRow label={t('sort')}>
          {(
            [
              ['sold', t('sortSold')],
              ['priceAsc', t('sortPriceAsc')],
              ['priceDesc', t('sortPriceDesc')],
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
      {state.kind === 'loading' && activeTab !== 'mine' && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/40">
          {t('loading')}
        </div>
      )}
      {state.kind === 'error' && activeTab !== 'mine' && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {t('errorLoading')}: {state.msg}
        </div>
      )}

      {/* Grid — visible on any tab that has resolved data */}
      {(state.kind === 'ok' || activeTab === 'mine') && (
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
                : activeTab === 'mine' && myLinks.length === 0
                  ? t('mineEmpty')
                  : t('empty')}
            </div>
          )}
          {/* Infinite-scroll sentinel — invisible, triggers next page when
              it scrolls into view. rootMargin preloads before hitting bottom. */}
          {totalMatching > visibleCount && (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center py-4 text-xs text-gray-400"
              aria-hidden
            >
              {t('loadingMore')}
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
  const soldLabel = compactNumber(deal.sold)
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40">
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
        {/* Favorite toggle — top-left */}
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? t('unfavorite') : t('favorite')}
          title={isFavorite ? t('unfavorite') : t('favorite')}
          className="absolute top-1.5 left-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-base shadow-md ring-1 ring-black/5 transition-transform hover:scale-110 active:scale-95 dark:bg-gray-800 dark:ring-white/10"
        >
          {isFavorite ? '❤️' : '🤍'}
        </button>
        {/* Discount badge — only when upstream provides it */}
        {deal.discountPct && deal.discountPct > 0 ? (
          <span className="absolute top-1 right-1 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            -{deal.discountPct}%
          </span>
        ) : null}
        {/* Sale-slot chip — only shown for items sourced from data_dealxk */}
        {deal.saleSlot ? (
          <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
            🕐 {deal.saleSlot}
            {deal.saleDate ? ` · ${deal.saleDate}` : ''}
          </span>
        ) : null}
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
          {deal.originalPrice && deal.originalPrice > deal.price ? (
            <span className="text-[10px] text-gray-400 line-through">
              {VND.format(deal.originalPrice)}
            </span>
          ) : null}
        </div>

        {/* Trust row: rating · sold · shop */}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[10px] text-gray-500 dark:text-gray-400">
          {deal.rating ? <span>⭐ {deal.rating.toFixed(1)}</span> : null}
          {deal.sold > 0 ? (
            <span>
              {soldLabel} {t('soldSuffix')}
            </span>
          ) : null}
          {deal.shopName ? (
            <span className="max-w-[10ch] truncate" title={deal.shopName}>
              · {deal.shopName}
            </span>
          ) : null}
        </div>

        {/* Stock progress bar — only when upstream provided both amount and
            sold (flash-sale items from data_dealxk). Shows sale burn-through
            so a user can eyeball "still available" vs "almost gone". */}
        {deal.amount && deal.amount > 0 ? (
          <div className="mt-1.5 space-y-0.5">
            <div className="h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full bg-orange-500"
                style={{
                  width: `${Math.min(100, Math.round((deal.sold / deal.amount) * 100))}%`,
                }}
              />
            </div>
          </div>
        ) : null}

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

// Compact number: 12500 → "12,5k", 1_200_000 → "1,2tr"
function compactNumber(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}tr`
}

export default ShopeeDealsBoard
