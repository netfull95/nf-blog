'use client'

import { useState } from 'react'
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
  graphEnabled: boolean
  blocked?: boolean
  fetchError?: string
}

type ApiState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; messageKey: string; retrySeconds?: number }
  | { kind: 'ok'; data: FbInfoResponse }

const FBInfoExtractor = () => {
  const t = useTranslations('Tools.fb')

  const [url, setUrl] = useState('')
  const [state, setState] = useState<ApiState>({ kind: 'idle' })
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const lookup = async () => {
    if (!url.trim()) {
      setState({ kind: 'error', messageKey: 'errorEmpty' })
      return
    }
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
      setState({ kind: 'ok', data: json as FbInfoResponse })
    } catch {
      setState({ kind: 'error', messageKey: 'errorUnknown' })
    }
  }

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
      setTimeout(() => setCopiedField((curr) => (curr === field ? null : curr)), 1500)
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
            className="bg-primary-500 hover:bg-primary-600 inline-flex shrink-0 items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.kind === 'loading' ? t('lookingUp') : t('lookupBtn')}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t('shortcutHint')}</p>
      </div>

      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
        <p className="mb-1 font-semibold">{t('limitationsTitle')}</p>
        <p className="text-xs leading-5">{t('limitationsBody')}</p>
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

      {state.kind === 'ok' && (
        <ResultCard
          data={state.data}
          t={t}
          copyValue={copyValue}
          copiedField={copiedField}
        />
      )}

      {state.kind === 'idle' && (
        <p className="text-sm text-gray-400">{t('noResultYet')}</p>
      )}
    </div>
  )
}

const ResultCard = ({
  data,
  t,
  copyValue,
  copiedField,
}: {
  data: FbInfoResponse
  t: ReturnType<typeof useTranslations<'Tools.fb'>>
  copyValue: (field: string, value: string) => void
  copiedField: string | null
}) => {
  type FieldLabel =
    | 'fieldName'
    | 'fieldUsername'
    | 'fieldActorId'
    | 'fieldPageId'
    | 'fieldCanonicalUrl'
    | 'fieldType'
    | 'fieldCategory'
    | 'fieldAbout'
    | 'fieldFanCount'
    | 'fieldDescription'

  const fields: { key: string; labelKey: FieldLabel; value?: string; mono?: boolean; hint?: string }[] = [
    { key: 'name', labelKey: 'fieldName', value: data.name },
    { key: 'username', labelKey: 'fieldUsername', value: data.username, mono: true },
    { key: 'actorId', labelKey: 'fieldActorId', value: data.actorId, mono: true },
    {
      key: 'pageId',
      labelKey: 'fieldPageId',
      value: data.pageId,
      mono: true,
      // Show a hint row when the user could have a Page ID but token isn't configured.
      hint: !data.pageId && !data.graphEnabled ? t('pageIdHintNoToken') : undefined,
    },
    { key: 'canonicalUrl', labelKey: 'fieldCanonicalUrl', value: data.canonicalUrl, mono: true },
    { key: 'type', labelKey: 'fieldType', value: data.kind !== 'unknown' ? data.kind : data.ogType },
    { key: 'category', labelKey: 'fieldCategory', value: data.category },
    {
      key: 'fanCount',
      labelKey: 'fieldFanCount',
      value: typeof data.fanCount === 'number' ? data.fanCount.toLocaleString() : undefined,
    },
    { key: 'about', labelKey: 'fieldAbout', value: data.about },
    { key: 'description', labelKey: 'fieldDescription', value: data.description },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('results')}</h2>

      {data.blocked && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          {t('errorFbBlocked')}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        {data.profileImage && (
          <>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('fieldProfileImage')}
            </div>
            <div>
              <Image
                src={data.profileImage}
                alt={data.name || 'profile'}
                width={120}
                height={120}
                unoptimized
                className="rounded-md border border-gray-200 dark:border-gray-700"
              />
            </div>
          </>
        )}

        {fields.map((f) => {
          if (!f.value && !f.hint) return null
          return (
            <div key={f.key} className="contents">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t(f.labelKey)}
              </div>
              <div className="flex flex-col gap-1">
                {f.value ? (
                  <div className="flex items-start gap-2">
                    <span
                      className={`break-all text-sm text-gray-900 dark:text-gray-100 ${
                        f.mono ? 'font-mono' : ''
                      }`}
                    >
                      {f.value}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyValue(f.key, f.value!)}
                      className="hover:text-primary-500 dark:hover:text-primary-400 shrink-0 rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
                    >
                      {copiedField === f.key ? t('copied') : t('copyValue')}
                    </button>
                  </div>
                ) : null}
                {f.hint ? (
                  <p className="text-xs text-gray-500 italic dark:text-gray-400">{f.hint}</p>
                ) : null}
              </div>
            </div>
          )
        })}

        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('fieldOpenInFb')}
        </div>
        <div>
          <a
            href={data.canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 text-sm break-all underline"
          >
            {data.canonicalUrl}
          </a>
        </div>
      </div>
    </div>
  )
}

export default FBInfoExtractor
