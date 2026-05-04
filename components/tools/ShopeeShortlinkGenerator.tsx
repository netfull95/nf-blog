'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

type SuccessData = { shortLink: string; longLink: string; expandedFrom?: string }

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

const ShopeeShortlinkGenerator = () => {
  const t = useTranslations('Tools.shopee')

  const [url, setUrl] = useState('')
  const [subId, setSubId] = useState('')
  const [state, setState] = useState<ApiState>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

  const submit = async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setState({ kind: 'error', err: { error: 'EMPTY' } })
      return
    }
    setState({ kind: 'loading' })
    try {
      // Sub IDs: split on '-' so users can target specific slots like
      // "blog-spring-promo--", and re-pack on the server side.
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
      setState({ kind: 'ok', data: json as SuccessData })
      setCopied(false)
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

      {state.kind === 'ok' && <ResultCard data={state.data} t={t} copied={copied} onCopy={copyShortlink} />}
      {state.kind === 'error' && <ErrorCard err={state.err} t={t} />}
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
    {data.expandedFrom ? (
      <p className="text-xs text-gray-600 dark:text-gray-400">
        ↪ {t('expandedFromLabel')}: <code className="break-all">{data.expandedFrom}</code>
      </p>
    ) : null}
    {data.longLink ? (
      <div>
        <div className="mb-1 text-xs font-medium tracking-wide text-gray-600 uppercase dark:text-gray-300">
          {t('longlinkLabel')}
        </div>
        <a
          href={data.longLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 text-xs break-all underline"
        >
          {data.longLink}
        </a>
      </div>
    ) : null}
  </div>
)

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
    case 'NOT_SHOPEE':
      return t('errorNotShopee')
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
