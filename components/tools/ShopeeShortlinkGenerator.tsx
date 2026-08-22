'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

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

type SavedLink = {
  id: string
  shortLink: string
  cleanUrl: string
  shopId?: string
  itemId?: string
  productName?: string
  createdAt: number
}

const HISTORY_KEY = 'nf-shopee-history'
const HISTORY_MAX = 50

const ShopeeShortlinkGenerator = () => {
  const t = useTranslations('Tools.shopee')

  const [url, setUrl] = useState('')
  const [subId, setSubId] = useState('')
  const [state, setState] = useState<ApiState>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<SavedLink[]>([])

  // Load history from localStorage on mount (client-only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as SavedLink[]
      if (Array.isArray(parsed)) setHistory(parsed.slice(0, HISTORY_MAX))
    } catch {
      /* ignore malformed history */
    }
  }, [])

  const persistHistory = useCallback((next: SavedLink[]) => {
    setHistory(next)
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
    } catch {
      /* quota exceeded or blocked — nothing we can do */
    }
  }, [])

  const addToHistory = useCallback((data: SuccessData) => {
    const entry: SavedLink = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`,
      shortLink: data.shortLink,
      cleanUrl: data.longLink,
      shopId: data.shopId,
      itemId: data.itemId,
      productName: data.productName,
      createdAt: Date.now(),
    }
    setHistory((prev) => {
      // Dedupe by cleanUrl — if the same product was shortened before,
      // remove the old entry and push the new one to the top (LIFO).
      // Carry the old productName forward when the new response doesn't
      // have one (user re-pastes /product/X/Y after originally saving via
      // the slug URL).
      const existing = prev.find((h) => h.cleanUrl === entry.cleanUrl)
      const merged = existing
        ? { ...entry, productName: entry.productName || existing.productName }
        : entry
      const withoutDupe = prev.filter((h) => h.cleanUrl !== entry.cleanUrl)
      const next = [merged, ...withoutDupe].slice(0, HISTORY_MAX)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
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
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-orange-100 to-red-100 text-2xl text-orange-500 dark:from-orange-900/40 dark:to-red-900/40">
              🛒
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p
                className="line-clamp-2 text-sm font-medium text-gray-900 dark:text-gray-100"
                title={item.productName || item.cleanUrl}
              >
                {item.productName || item.cleanUrl}
              </p>
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
