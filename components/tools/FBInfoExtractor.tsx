'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

type FbInfoResponse = {
  username?: string
  actorId?: string
  pageId?: string
  canonicalUrl: string
  kind: 'profile' | 'page' | 'unknown'
  name?: string
  description?: string
  profileImage?: string
  ogType?: string
  category?: string
  about?: string
  fanCount?: number
  talkingAbout?: number
  wereHere?: number
  graphEnabled: boolean
  blocked?: boolean
  fetchError?: string
}

type ApiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; messageKey: string; retrySeconds?: number }
  | { kind: 'ok'; data: FbInfoResponse; fromCache?: boolean }

type CacheEntry = {
  url: string // normalized input URL (the key)
  fetchedAt: number // unix ms
  data: FbInfoResponse
}

const CACHE_KEY = 'fb-info-cache:v1'
const CACHE_MAX_ENTRIES = 50

function truncate(s: string, max = 60): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function normalizeUrl(input: string): string {
  // Lowercase + strip trailing slash + drop hash. Same input → same cache key.
  try {
    const u = new URL(input.trim().startsWith('http') ? input.trim() : 'https://' + input.trim())
    u.hash = ''
    return u.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return input.trim().toLowerCase()
  }
}

function loadCache(): CacheEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CacheEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveCache(entries: CacheEntry[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries))
  } catch {
    /* quota exceeded — silently drop */
  }
}

function upsertCacheEntry(url: string, data: FbInfoResponse): CacheEntry[] {
  const key = normalizeUrl(url)
  let cache = loadCache().filter((e) => e.url !== key)
  cache.unshift({ url: key, fetchedAt: Date.now(), data })
  if (cache.length > CACHE_MAX_ENTRIES) cache = cache.slice(0, CACHE_MAX_ENTRIES)
  saveCache(cache)
  return cache
}

function deleteCacheEntry(url: string): CacheEntry[] {
  const cache = loadCache().filter((e) => e.url !== url)
  saveCache(cache)
  return cache
}

function clearCache(): CacheEntry[] {
  saveCache([])
  return []
}

type TrustSignal = {
  key: string
  level: 'good' | 'warn' | 'bad'
  message: string
}

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (combining marks)
    .replace(/[^a-z0-9]/g, '') // keep only alnum
}

function usernameMatchesName(username?: string, name?: string): boolean {
  if (!username || !name) return true // skip signal if either missing
  const u = normalizeForCompare(username)
  const n = normalizeForCompare(name)
  if (!u || !n) return true
  if (n.includes(u) || u.includes(n)) return true
  // longest common substring of length >= 4 still counts as match
  for (let i = 0; i < u.length - 3; i++) {
    if (n.includes(u.substring(i, i + 4))) return true
  }
  return false
}

const SUSPICIOUS_KEYWORDS = [
  'official',
  'chính chủ',
  'chinh chu',
  '100%',
  'uy tín',
  'uy tin',
  'verified',
  'real',
  'gốc',
  'goc',
]

function computeTrustSignals(
  data: FbInfoResponse,
  t: ReturnType<typeof useTranslations<'Tools.fb'>>
): TrustSignal[] {
  const signals: TrustSignal[] = []

  // 1. Engagement rate analysis (talking_about / fan_count)
  if (typeof data.fanCount === 'number' && typeof data.talkingAbout === 'number' && data.fanCount > 0) {
    const rate = (data.talkingAbout / data.fanCount) * 100
    const rateFmt = rate < 0.1 ? rate.toFixed(3) : rate.toFixed(2)
    if (rate < 0.05) {
      signals.push({
        key: 'engagement',
        level: 'bad',
        message: t('trustEngagementLow', { rate: rateFmt }),
      })
    } else if (rate > 15) {
      signals.push({
        key: 'engagement',
        level: 'warn',
        message: t('trustEngagementHigh', { rate: rateFmt }),
      })
    } else if (rate >= 0.5) {
      signals.push({
        key: 'engagement',
        level: 'good',
        message: t('trustEngagementGood', { rate: rateFmt }),
      })
    } else {
      signals.push({
        key: 'engagement',
        level: 'warn',
        message: t('trustEngagementMid', { rate: rateFmt }),
      })
    }
  }

  // 2. Username vs display name similarity (rebrand detector)
  if (data.username && data.name) {
    if (usernameMatchesName(data.username, data.name)) {
      signals.push({ key: 'username', level: 'good', message: t('trustUsernameMatch') })
    } else {
      signals.push({ key: 'username', level: 'warn', message: t('trustUsernameMismatch') })
    }
  }

  // 3. Actor ID format hints at page creation era. "100..." prefix is the
  // newer (post-2020) FB user-mode ID scheme; older pages use 14-digit IDs.
  if (data.actorId && /^100\d{13,14}$/.test(data.actorId)) {
    signals.push({ key: 'newActor', level: 'warn', message: t('trustNewPageActor') })
  }

  // 4. Big page missing About section
  if (typeof data.fanCount === 'number' && data.fanCount > 1000 && !data.about) {
    signals.push({
      key: 'missingAbout',
      level: 'warn',
      message: t('trustMissingAbout', { likes: data.fanCount.toLocaleString() }),
    })
  }

  // 5. Suspicious keywords in display name
  if (data.name) {
    const lower = data.name.toLowerCase()
    for (const kw of SUSPICIOUS_KEYWORDS) {
      if (lower.includes(kw)) {
        signals.push({
          key: 'suspKeyword',
          level: 'warn',
          message: t('trustSuspiciousKeyword', { word: kw }),
        })
        break
      }
    }
  }

  // 6. No category
  if (typeof data.fanCount === 'number' && data.fanCount > 1000 && !data.category) {
    signals.push({ key: 'noCategory', level: 'warn', message: t('trustNoCategory') })
  }

  return signals
}

function formatTimeAgo(
  ts: number,
  t: ReturnType<typeof useTranslations<'Tools.fb'>>
): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return t('timeJustNow')
  if (minutes < 60) return t('timeMinutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('timeHoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  return t('timeDaysAgo', { n: days })
}

const FBInfoExtractor = () => {
  const t = useTranslations('Tools.fb')

  const [url, setUrl] = useState('')
  const [state, setState] = useState<ApiState>({ kind: 'idle' })
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [history, setHistory] = useState<CacheEntry[]>([])
  const [limitationsOpen, setLimitationsOpen] = useState(false)

  // Hydrate history from localStorage on mount + listen for cross-tab updates.
  useEffect(() => {
    setHistory(loadCache())
    const onStorage = (e: StorageEvent) => {
      if (e.key === CACHE_KEY) setHistory(loadCache())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const lookup = async () => {
    if (!url.trim()) {
      setState({ kind: 'error', messageKey: 'errorEmpty' })
      return
    }

    // Always fetch fresh on lookup — cache is only used as a history store,
    // surfaced via the History panel's "Xem lại" button.
    setState({ kind: 'loading' })
    try {
      const res = await fetch(`/api/tools/fb-info?url=${encodeURIComponent(url.trim())}`)
      const json = await res.json()
      if (!res.ok) {
        const code = (json?.error as string) || ''
        if (res.status === 429 || code === 'RATE_LIMITED') {
          const headerRetry = Number(res.headers.get('Retry-After'))
          const seconds =
            (typeof json?.retryAfterSec === 'number' && json.retryAfterSec) ||
            (Number.isFinite(headerRetry) ? headerRetry : 30)
          setState({ kind: 'error', messageKey: 'errorRateLimited', retrySeconds: seconds })
          return
        }
        const messageKey =
          code === 'EMPTY'
            ? 'errorEmpty'
            : code === 'NOT_FACEBOOK'
              ? 'errorInvalidUrl'
              : code === 'PARSE_FAILED'
                ? 'errorParseFailed'
                : code === 'INVALID_URL'
                  ? 'errorInvalidUrl'
                  : 'errorUnknown'
        setState({ kind: 'error', messageKey })
        return
      }
      const data = json as FbInfoResponse
      setState({ kind: 'ok', data })
      // Persist to cache + update history panel.
      setHistory(upsertCacheEntry(url, data))
    } catch {
      setState({ kind: 'error', messageKey: 'errorUnknown' })
    }
  }

  const loadFromHistory = useCallback((entry: CacheEntry) => {
    setUrl(entry.data.canonicalUrl || entry.url)
    setState({ kind: 'ok', data: entry.data, fromCache: true })
  }, [])

  const deleteHistoryEntry = useCallback((entryUrl: string) => {
    setHistory(deleteCacheEntry(entryUrl))
  }, [])

  const clearAllHistory = useCallback(() => {
    if (confirm(t('historyClearConfirm'))) {
      setHistory(clearCache())
    }
  }, [t])

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void lookup()
    }
  }

  const copyValue = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setToast(t('copiedToast', { value: truncate(value) }))
      setTimeout(() => {
        setCopiedField((curr) => (curr === field ? null : curr))
        setToast(null)
      }, 2000)
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
        <label htmlFor="fb-url" className={labelClass}>
          {t('inputLabel')}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="fb-url"
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
            onClick={lookup}
            disabled={state.kind === 'loading'}
            className="bg-primary-500 hover:bg-primary-600 inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.kind === 'loading' ? (
              <>
                <Spinner />
                {t('lookingUp')}
              </>
            ) : (
              t('lookupBtn')
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('shortcutHint')}</p>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setLimitationsOpen((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          aria-expanded={limitationsOpen}
          aria-label={t('limitationsTitle')}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {t('limitationsTitle')}
        </button>
        {limitationsOpen && (
          <p className="mt-1.5 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
            {t('limitationsBody')}
          </p>
        )}
      </div>

      {state.kind === 'error' && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
        >
          {state.messageKey === 'errorRateLimited'
            ? t('errorRateLimited', { seconds: state.retrySeconds ?? 30 })
            : t(
                state.messageKey as
                  | 'errorEmpty'
                  | 'errorInvalidUrl'
                  | 'errorParseFailed'
                  | 'errorUnknown'
              )}
        </p>
      )}

      {state.kind === 'loading' && <LoadingSkeleton hint={t('loadingHint')} />}

      {state.kind === 'ok' && (
        <ResultCard
          data={state.data}
          t={t}
          copyValue={copyValue}
          copiedField={copiedField}
          fromCache={state.fromCache}
        />
      )}

      {state.kind === 'idle' && <p className="text-sm text-gray-400">{t('noResultYet')}</p>}

      <HistoryPanel
        entries={history}
        t={t}
        onLoad={loadFromHistory}
        onDelete={deleteHistoryEntry}
        onClearAll={clearAllHistory}
      />

      {toast && <Toast message={toast} />}
    </div>
  )
}

const Spinner = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg
    className={`${className} animate-spin`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
    />
  </svg>
)

const LoadingSkeleton = ({ hint }: { hint: string }) => (
  <div className="space-y-4">
    <div className="text-primary-600 dark:text-primary-400 flex items-center gap-3 text-sm">
      <Spinner className="h-5 w-5" />
      <span className="animate-pulse">{hint}</span>
    </div>
    <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
      <div className="h-[120px] w-[120px] animate-pulse rounded-md bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800" />
      <div className="flex flex-col gap-3">
        {[80, 65, 90, 55, 70].map((w, i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700"
            style={{ width: `${w}%`, animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  </div>
)

const Toast = ({ message }: { message: string }) => (
  <div
    role="status"
    aria-live="polite"
    className="toast-enter fixed bottom-6 left-1/2 z-50 max-w-sm -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
  >
    {message}
  </div>
)

const TrustPanel = ({
  signals,
  t,
}: {
  signals: TrustSignal[]
  t: ReturnType<typeof useTranslations<'Tools.fb'>>
}) => {
  const levelClass: Record<TrustSignal['level'], string> = {
    good: 'text-emerald-700 dark:text-emerald-300',
    warn: 'text-amber-700 dark:text-amber-300',
    bad: 'text-red-700 dark:text-red-300',
  }
  const dotClass: Record<TrustSignal['level'], string> = {
    good: 'bg-emerald-500',
    warn: 'bg-amber-500',
    bad: 'bg-red-500',
  }

  return (
    <div className="border-t border-gray-100 px-3 py-2 dark:border-gray-800">
      <p className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
        {t('trustTitle')}
      </p>
      {signals.length > 0 ? (
        <ul className="space-y-1">
          {signals.map((s, i) => (
            <li key={`${s.key}-${i}`} className="flex items-start gap-2 text-xs">
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass[s.level]}`}
                aria-hidden="true"
              />
              <span className={levelClass[s.level]}>{s.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800/50">
        <p className="mb-1 text-[11px] font-medium text-gray-600 dark:text-gray-400">
          {t('trustManualCheckTitle')}
        </p>
        <ul className="ml-3 list-disc space-y-0.5 text-[11px] text-gray-500 dark:text-gray-500">
          <li>{t('trustManualCheck1')}</li>
          <li>{t('trustManualCheck2')}</li>
          <li>{t('trustManualCheck3')}</li>
          <li>{t('trustManualCheck4')}</li>
        </ul>
      </div>
    </div>
  )
}

const ResultCard = ({
  data,
  t,
  copyValue,
  copiedField,
  fromCache,
}: {
  data: FbInfoResponse
  t: ReturnType<typeof useTranslations<'Tools.fb'>>
  copyValue: (field: string, value: string) => void
  copiedField: string | null
  fromCache?: boolean
}) => {
  const [downloading, setDownloading] = useState(false)

  const downloadAvatar = async () => {
    if (!data.pageId) return
    setDownloading(true)
    const downloadUrl = `https://graph.facebook.com/${data.pageId}/picture?width=1000&height=1000`
    const filename = `avatar-${data.username || data.pageId}.jpg`
    try {
      const res = await fetch(downloadUrl)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      // CORS fallback: open in new tab so user can save manually
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setDownloading(false)
    }
  }

  type FieldLabel =
    | 'fieldName'
    | 'fieldUsername'
    | 'fieldActorId'
    | 'fieldPageId'
    | 'fieldCategory'
    | 'fieldAbout'
    | 'fieldFanCount'
    | 'fieldTalkingAbout'
    | 'fieldWereHere'

  const fmtNum = (n?: number) => (typeof n === 'number' ? n.toLocaleString() : undefined)

  const fields: { key: string; labelKey: FieldLabel; value?: string; mono?: boolean; hint?: string }[] = [
    { key: 'name', labelKey: 'fieldName', value: data.name },
    { key: 'username', labelKey: 'fieldUsername', value: data.username, mono: true },
    {
      key: 'actorId',
      labelKey: 'fieldActorId',
      value: data.actorId,
      mono: true,
      hint: !data.actorId ? t('actorIdHintNotFound') : undefined,
    },
    {
      key: 'pageId',
      labelKey: 'fieldPageId',
      value: data.pageId,
      mono: true,
      hint: !data.pageId ? t('pageIdHintNoToken') : undefined,
    },
    { key: 'category', labelKey: 'fieldCategory', value: data.category },
    { key: 'fanCount', labelKey: 'fieldFanCount', value: fmtNum(data.fanCount) },
    { key: 'talkingAbout', labelKey: 'fieldTalkingAbout', value: fmtNum(data.talkingAbout) },
    { key: 'wereHere', labelKey: 'fieldWereHere', value: fmtNum(data.wereHere) },
    { key: 'about', labelKey: 'fieldAbout', value: data.about },
  ]

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700">
      {data.blocked && (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          {t('errorFbBlocked')}
        </p>
      )}

      {/* Header: avatar + name + cache badge + open-in-fb + download */}
      <div className="flex items-start gap-3 border-b border-gray-100 p-3 dark:border-gray-800">
        {data.profileImage ? (
          <Image
            src={data.profileImage}
            alt={data.name || 'profile'}
            width={64}
            height={64}
            unoptimized
            className="h-16 w-16 shrink-0 rounded-md border border-gray-200 object-cover dark:border-gray-700"
          />
        ) : (
          <div className="h-16 w-16 shrink-0 rounded-md bg-gray-100 dark:bg-gray-800" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={data.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary-600 dark:hover:text-primary-400 inline-flex items-center gap-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100"
              title={data.canonicalUrl}
            >
              {data.name || data.username || data.canonicalUrl}
              <svg className="h-3 w-3 shrink-0 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            {fromCache && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t('fromCache')}
              </span>
            )}
          </div>
          {data.pageId && (
            <button
              type="button"
              onClick={downloadAvatar}
              disabled={downloading}
              className="bg-primary-50 hover:bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:hover:bg-primary-900/50 dark:text-primary-300 inline-flex w-fit cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloading ? (
                <>
                  <Spinner className="h-3 w-3" />
                  {t('downloading')}
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                  </svg>
                  {t('downloadAvatar')}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Field rows: whole row click-to-copy */}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {fields.map((f) => {
          if (!f.value && !f.hint) return null
          const canCopy = !!f.value
          const isCopied = copiedField === f.key
          return (
            <li key={f.key}>
              {canCopy ? (
                <button
                  type="button"
                  onClick={() => copyValue(f.key, f.value!)}
                  title={t('copyValue')}
                  className="group flex w-full cursor-copy items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <span className="w-20 shrink-0 text-xs text-gray-500 dark:text-gray-400 sm:w-24">
                    {t(f.labelKey)}
                  </span>
                  <span
                    className={`flex-1 break-all text-sm text-gray-900 dark:text-gray-100 ${
                      f.mono ? 'font-mono' : ''
                    }`}
                  >
                    {f.value}
                  </span>
                  <span
                    className={`shrink-0 text-[10px] uppercase tracking-wide transition-opacity ${
                      isCopied
                        ? 'text-emerald-600 opacity-100 dark:text-emerald-400'
                        : 'text-gray-400 opacity-0 group-hover:opacity-100 dark:text-gray-500'
                    }`}
                  >
                    {isCopied ? t('copied') : '⧉'}
                  </span>
                </button>
              ) : (
                <div className="flex items-start gap-3 px-3 py-1.5">
                  <span className="w-20 shrink-0 text-xs text-gray-500 dark:text-gray-400 sm:w-24">
                    {t(f.labelKey)}
                  </span>
                  <span className="flex-1 text-xs text-gray-500 italic dark:text-gray-400">
                    {f.hint}
                  </span>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* Trust signals panel */}
      <TrustPanel signals={computeTrustSignals(data, t)} t={t} />

      {/* Footer — legit check shortcuts */}
      {(data.pageId || data.username) && (
        <div className="flex flex-wrap gap-2 border-t border-gray-100 px-3 py-2 dark:border-gray-800">
          {data.pageId && (
            <a
              href={`https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${data.pageId}`}
              target="_blank"
              rel="noopener noreferrer"
              title={t('legitAdLibraryHint')}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              {t('legitAdLibraryBtn')}
            </a>
          )}
          {data.username && (
            <a
              href={`https://www.facebook.com/${data.username}/about`}
              target="_blank"
              rel="noopener noreferrer"
              title={t('legitAboutHint')}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('legitAboutBtn')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

const HistoryPanel = ({
  entries,
  t,
  onLoad,
  onDelete,
  onClearAll,
}: {
  entries: CacheEntry[]
  t: ReturnType<typeof useTranslations<'Tools.fb'>>
  onLoad: (entry: CacheEntry) => void
  onDelete: (entryUrl: string) => void
  onClearAll: () => void
}) => {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = entries.filter((e) => {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    const d = e.data
    return (
      d.name?.toLowerCase().includes(q) ||
      d.username?.toLowerCase().includes(q) ||
      d.pageId?.includes(q) ||
      d.actorId?.includes(q) ||
      e.url.includes(q)
    )
  })

  if (entries.length === 0) return null

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
          {t('historyTitle')}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({t('historyCount', { count: entries.length })})
          </span>
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {expanded ? t('historyCollapse') : t('historyExpand')}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 p-3 dark:border-gray-700">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('historySearchPlaceholder')}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:ring-primary-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {t('historyClearAll')}
            </button>
          </div>

          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              {query.trim() ? t('historyNoMatch') : t('historyEmpty')}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {filtered.map((entry) => (
                <HistoryRow
                  key={entry.url}
                  entry={entry}
                  t={t}
                  onLoad={onLoad}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const HistoryRow = ({
  entry,
  t,
  onLoad,
  onDelete,
}: {
  entry: CacheEntry
  t: ReturnType<typeof useTranslations<'Tools.fb'>>
  onLoad: (entry: CacheEntry) => void
  onDelete: (entryUrl: string) => void
}) => {
  const d = entry.data
  const subId = d.pageId || d.actorId || d.username || ''
  return (
    <li className="flex items-center gap-3 py-2">
      {d.profileImage ? (
        <Image
          src={d.profileImage}
          alt={d.name || 'avatar'}
          width={40}
          height={40}
          unoptimized
          className="h-10 w-10 shrink-0 rounded-md border border-gray-200 object-cover dark:border-gray-700"
        />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-md bg-gray-200 dark:bg-gray-700" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {d.name || d.username || entry.url}
        </span>
        {subId && (
          <span className="truncate font-mono text-xs text-gray-500 dark:text-gray-400">
            {subId}
          </span>
        )}
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          {formatTimeAgo(entry.fetchedAt, t)}
        </span>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => onLoad(entry)}
          className="hover:text-primary-500 dark:hover:text-primary-400 cursor-pointer rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 transition-colors dark:border-gray-700 dark:text-gray-400"
        >
          {t('historyLoad')}
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry.url)}
          className="cursor-pointer rounded border border-red-200 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
          aria-label={t('historyDelete')}
        >
          ✕
        </button>
      </div>
    </li>
  )
}

export default FBInfoExtractor
