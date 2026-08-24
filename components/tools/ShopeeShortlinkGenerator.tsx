'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  addToHistory as sharedAddToHistory,
  fetchProductPreview,
  loadHistory,
  newHistoryId,
  saveHistory,
  type SavedShortlink,
} from '@/lib/shopee/history'

type SuccessData = {
  shortLink: string
  longLink: string
  shopId?: string
  itemId?: string
  productName?: string
}

type ApiError = {
  error: string
  missing?: string[]
  message?: string
  retryAfterSec?: number
}

type ApiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: SuccessData }
  | { kind: 'error'; err: ApiError }

// Local alias for readability — the shared type covers every field either
// tool might store; this component uses the same shape.
type SavedLink = SavedShortlink

const ShopeeShortlinkGenerator = () => {
  const t = useTranslations('Tools.shopee')

  const [url, setUrl] = useState('')
  const [subId, setSubId] = useState('')
  const [state, setState] = useState<ApiState>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<SavedLink[]>([])

  // Load history from localStorage on mount (client-only)
  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const persistHistory = useCallback((next: SavedLink[]) => {
    setHistory(next)
    saveHistory(next)
  }, [])

  // Lazy-fetch productName + imageUrl for history items that don't have one
  // yet (either newly added or from the pre-preview version of this tool).
  // Runs once per mount; failed items are marked so we don't retry every
  // render. Uses the public addlivetag CORS-enabled API — no proxy needed.
  useEffect(() => {
    // Refetch when the item is missing either image OR price — the latter
    // means it was saved before the price/rating/sales fields were added.
    const pending = history.filter(
      (h) =>
        h.itemId &&
        (!h.imageUrl || !h.price) &&
        h.previewStatus !== 'failed'
    )
    if (!pending.length) return

    let cancelled = false
    ;(async () => {
      for (const item of pending) {
        const preview = await fetchProductPreview(item.itemId!)
        if (cancelled) return
        setHistory((prev) => {
          const next = prev.map((h) => {
            if (h.id !== item.id) return h
            // preview === null → fetch failed; preview === {} → API OK but
            // no data (product not in DB / delisted). Both cases mark 'failed'
            // to avoid retry storm; leave the item's existing fields intact.
            if (!preview || Object.keys(preview).length === 0) {
              return { ...h, previewStatus: 'failed' as const }
            }
            return {
              ...h,
              // Only fill fields the item is missing so a re-fetch doesn't
              // clobber values the user (or previous fetch) already set.
              productName: h.productName || preview.productName,
              imageUrl: h.imageUrl || preview.imageUrl,
              shopName: h.shopName || preview.shopName,
              price: h.price ?? preview.price,
              sales: h.sales ?? preview.sales,
              rating: h.rating ?? preview.rating,
              originalPrice: h.originalPrice ?? preview.originalPrice,
              discountPercent: h.discountPercent ?? preview.discountPercent,
              flashSale: h.flashSale ?? preview.flashSale,
              stockAvailable: h.stockAvailable ?? preview.stockAvailable,
              minPrice: h.minPrice ?? preview.minPrice,
              previewStatus: undefined,
            }
          })
          saveHistory(next)
          return next
        })
      }
    })()
    return () => {
      cancelled = true
    }
    // Intentionally re-run when history length changes (new items added) —
    // not on every field mutation, or we'd loop forever after our own writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length])

  const addToHistory = useCallback((data: SuccessData) => {
    const entry: SavedLink = {
      id: newHistoryId(),
      shortLink: data.shortLink,
      cleanUrl: data.longLink,
      shopId: data.shopId,
      itemId: data.itemId,
      productName: data.productName,
      createdAt: Date.now(),
    }
    setHistory((prev) => {
      const next = sharedAddToHistory(entry, prev)
      saveHistory(next)
      return next
    })
  }, [])

  const deleteFromHistory = useCallback(
    (id: string) => {
      persistHistory(history.filter((h) => h.id !== id))
    },
    [history, persistHistory]
  )

  const clearHistory = useCallback(() => {
    persistHistory([])
  }, [persistHistory])

  const submit = async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setState({ kind: 'error', err: { error: 'EMPTY' } })
      return
    }
    setState({ kind: 'loading' })
    try {
      const subIds = subId.trim() ? subId.split('-').slice(0, 5) : []
      const res = await fetch('/api/tools/shopee-shortlink', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: trimmed, subIds }),
      })
      const json = (await res.json().catch(() => ({}))) as ApiError | SuccessData
      if (!res.ok) {
        setState({ kind: 'error', err: json as ApiError })
        return
      }
      const data = json as SuccessData
      setState({ kind: 'ok', data })
      setCopied(false)
      addToHistory(data)
    } catch (e) {
      setState({
        kind: 'error',
        err: { error: 'NETWORK_ERROR', message: e instanceof Error ? e.message : '' },
      })
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  const copyShortlink = async () => {
    if (state.kind !== 'ok') return
    try {
      await navigator.clipboard.writeText(state.data.shortLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const inputClass =
    'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:ring-primary-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300'

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="shopee-url" className={labelClass}>
          {t('inputLabel')}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="shopee-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('inputPlaceholder')}
            className={inputClass}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={submit}
            disabled={state.kind === 'loading'}
            className="bg-primary-500 hover:bg-primary-600 inline-flex shrink-0 items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.kind === 'loading' ? t('submitting') : t('submitBtn')}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('shortcutHint')}</p>
      </div>

      <details className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
        <summary className="cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
          {t('subIdToggle')}
        </summary>
        <div className="mt-3 space-y-1">
          <label htmlFor="shopee-subid" className={labelClass}>
            {t('subIdLabel')}
          </label>
          <input
            id="shopee-subid"
            type="text"
            value={subId}
            onChange={(e) => setSubId(e.target.value)}
            placeholder={t('subIdPlaceholder')}
            className={inputClass}
            spellCheck={false}
          />
          <p className="text-xs text-gray-500">{t('subIdHint')}</p>
        </div>
      </details>

      {state.kind === 'ok' && (
        <ResultCard data={state.data} t={t} copied={copied} onCopy={copyShortlink} />
      )}
      {state.kind === 'error' && <ErrorCard err={state.err} t={t} />}

      {history.length > 0 && (
        <HistoryList
          items={history}
          t={t}
          onDelete={deleteFromHistory}
          onClear={clearHistory}
        />
      )}
    </div>
  )
}

const ResultCard = ({
  data,
  t,
  copied,
  onCopy,
}: {
  data: SuccessData
  t: ReturnType<typeof useTranslations<'Tools.shopee'>>
  copied: boolean
  onCopy: () => void
}) => (
  <div className="space-y-4 rounded-lg border border-green-300 bg-green-50 p-5 dark:border-green-800 dark:bg-green-900/20">
    <p className="text-sm text-green-800 dark:text-green-200">{t('thanks')}</p>
    <div>
      <div className="mb-1 text-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-300">
        {t('shortlinkLabel')}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm break-all text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
          {data.shortLink}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="hover:text-primary-500 dark:hover:text-primary-400 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 dark:border-gray-700 dark:text-gray-100"
        >
          {copied ? t('copied') : t('copyBtn')}
        </button>
        <a
          href={data.shortLink}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-primary-500 hover:bg-primary-600 inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-white"
        >
          {t('openInNewTab')}
        </a>
      </div>
    </div>
  </div>
)

const HistoryList = ({
  items,
  t,
  onDelete,
  onClear,
}: {
  items: SavedLink[]
  t: ReturnType<typeof useTranslations<'Tools.shopee'>>
  onDelete: (id: string) => void
  onClear: () => void
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copy = async (item: SavedLink) => {
    try {
      await navigator.clipboard.writeText(item.shortLink)
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t('historyTitle', { count: items.length })}
        </h3>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t('historyClearConfirm'))) onClear()
          }}
          className="text-xs text-gray-500 hover:text-red-500 dark:text-gray-400"
        >
          {t('historyClearBtn')}
        </button>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/40"
          >
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt={item.productName || 'product'}
                className="h-16 w-16 shrink-0 rounded-md object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  // Broken image URL — fall back to placeholder icon
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-orange-100 to-red-100 text-2xl text-orange-500 dark:from-orange-900/40 dark:to-red-900/40">
                🛒
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p
                className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100"
                title={item.productName || item.cleanUrl}
              >
                {item.productName || item.cleanUrl}
              </p>

              {/* Price row: current price (bold) + strikethrough original +
                  discount % badge + flash sale badge. Show only when we have
                  addlivetag preview data — no clutter for missing fields. */}
              {item.price ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-semibold text-orange-600 dark:text-orange-400">
                    {formatVND(item.price)}
                  </span>
                  {item.originalPrice && item.originalPrice > item.price ? (
                    <span className="text-xs text-gray-400 line-through">
                      {formatVND(item.originalPrice)}
                    </span>
                  ) : null}
                  {item.discountPercent && item.discountPercent > 0 ? (
                    <span className="rounded-sm bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/40 dark:text-red-300">
                      -{item.discountPercent}%
                    </span>
                  ) : null}
                  {item.flashSale ? (
                    <span className="rounded-sm bg-orange-100 px-1 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                      🔥 Flash
                    </span>
                  ) : null}
                </div>
              ) : null}

              {/* Trust row: rating · sold · shop name. Each item conditional. */}
              {item.rating || item.sales || item.shopName ? (
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-gray-400">
                  {item.rating ? (
                    <span>⭐ {item.rating.toFixed(1)}</span>
                  ) : null}
                  {item.sales ? (
                    <span>{t('salesCount', { n: formatCompactNumber(item.sales) })}</span>
                  ) : null}
                  {item.shopName ? <span>· {item.shopName}</span> : null}
                </div>
              ) : null}

              {/* Urgency hints: low stock warning + price floor comparison.
                  Both are conditional — only render when actionable. */}
              {(item.stockAvailable != null && item.stockAvailable > 0 && item.stockAvailable < 50) ||
              (item.minPrice && item.price && item.minPrice < item.price) ? (
                <div className="flex flex-wrap items-center gap-x-2 text-xs">
                  {item.stockAvailable != null &&
                  item.stockAvailable > 0 &&
                  item.stockAvailable < 50 ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      ⚠ {t('stockWarning', { n: item.stockAvailable })}
                    </span>
                  ) : null}
                  {item.minPrice && item.price && item.minPrice < item.price ? (
                    <span className="text-gray-500 dark:text-gray-400">
                      📉 {t('priceMinHint', { price: formatVND(item.minPrice) })}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <code className="block truncate text-xs text-gray-500 dark:text-gray-400">
                {item.shortLink}
              </code>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => copy(item)}
                  className="hover:text-primary-500 dark:hover:text-primary-400 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-200"
                >
                  {copiedId === item.id ? t('copied') : t('copyBtn')}
                </button>
                <a
                  href={item.shortLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary-500 dark:hover:text-primary-400 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 dark:border-gray-700 dark:text-gray-200"
                >
                  {t('openInNewTab')}
                </a>
                <span className="text-xs text-gray-400">
                  {formatRelative(item.createdAt, t)}
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="ml-auto rounded px-2 py-1 text-xs text-gray-400 hover:text-red-500"
                  aria-label={t('historyDeleteBtn')}
                  title={t('historyDeleteBtn')}
                >
                  ×
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Format Vietnamese Dong: 122200 → "₫122.200"
const VND_FORMATTER = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
})
function formatVND(n: number): string {
  return VND_FORMATTER.format(n)
}

// Format large integers compactly: 1234 → "1.234", 12500 → "12,5k", 1_200_000 → "1,2tr"
function formatCompactNumber(n: number): string {
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}tr`
}

// Compact relative-time formatter — "5m ago", "2h ago", "3d ago"
function formatRelative(
  ts: number,
  t: ReturnType<typeof useTranslations<'Tools.shopee'>>
): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('timeJustNow')
  if (min < 60) return t('timeMinAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('timeHourAgo', { n: hr })
  const day = Math.floor(hr / 24)
  return t('timeDayAgo', { n: day })
}

const ErrorCard = ({
  err,
  t,
}: {
  err: ApiError
  t: ReturnType<typeof useTranslations<'Tools.shopee'>>
}) => {
  const summary = errorSummary(err, t)
  return (
    <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
      <p className="font-semibold">{t('errorTitle')}</p>
      <p>{summary}</p>
    </div>
  )
}

function errorSummary(
  err: ApiError,
  t: ReturnType<typeof useTranslations<'Tools.shopee'>>
): string {
  switch (err.error) {
    case 'EMPTY':
      return t('errorEmpty')
    case 'INVALID_URL':
      return t('errorInvalidUrl')
    case 'NOT_SHOPEE':
      return t('errorNotShopee')
    case 'NOT_PRODUCT_URL':
      return t('errorNotProductUrl')
    case 'EXPAND_FAILED':
      return t('errorExpandFailed')
    case 'NOT_CONFIGURED':
      return t('errorNotConfigured')
    case 'RATE_LIMITED':
      return t('errorRateLimited', { seconds: err.retryAfterSec ?? 30 })
    default:
      return t('errorUnknown')
  }
}

export default ShopeeShortlinkGenerator
