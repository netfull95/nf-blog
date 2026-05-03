'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import QRCode from 'qrcode'

const MAX_CONTENT = 2000
const MAX_NAME = 100
const SIZES = [200, 250, 300, 350, 400, 450, 500] as const
const EC_LEVEL = 'M' as const // industry default; balances density vs. damage tolerance
const DEBOUNCE_MS = 800
// Header band reserves enough space above the QR for an optional title.
const HEADER_PADDING = 24
const HEADER_LINE_HEIGHT = 28
const HEADER_FONT = 'bold 22px ui-sans-serif, system-ui, sans-serif'

type Status = { kind: 'idle' | 'success' | 'error'; message?: string }

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let line = words[0]
  for (let i = 1; i < words.length; i++) {
    const candidate = `${line} ${words[i]}`
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate
    } else {
      lines.push(line)
      line = words[i]
    }
  }
  lines.push(line)
  return lines
}

const QRGenerator = () => {
  const t = useTranslations('Tools.qr')

  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [size, setSize] = useState<(typeof SIZES)[number]>(300)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [hasOutput, setHasOutput] = useState(false)

  const outputCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const debounceRef = useRef<number | null>(null)

  const generate = useCallback(async () => {
    const canvas = outputCanvasRef.current
    if (!canvas) return

    const trimmed = content.trim()
    if (!trimmed) {
      setStatus({ kind: 'error', message: t('errorEmpty') })
      setHasOutput(false)
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    if (trimmed.length > MAX_CONTENT) {
      setStatus({ kind: 'error', message: t('errorTooLong') })
      return
    }

    try {
      // Draw the QR onto an offscreen canvas first so we can compose it with
      // an optional title header on the visible canvas.
      const qrCanvas = document.createElement('canvas')
      await QRCode.toCanvas(qrCanvas, trimmed, {
        width: size,
        margin: 2,
        errorCorrectionLevel: EC_LEVEL,
        color: { dark: '#000000', light: '#ffffff' },
      })

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const trimmedName = name.trim()
      let headerHeight = 0
      let headerLines: string[] = []

      if (trimmedName) {
        ctx.font = HEADER_FONT
        const innerWidth = size - HEADER_PADDING * 2
        headerLines = wrapLines(ctx, trimmedName, innerWidth).slice(0, 3)
        headerHeight = HEADER_PADDING + headerLines.length * HEADER_LINE_HEIGHT
      }

      canvas.width = size
      canvas.height = size + headerHeight

      // White background so JPEG export and clipboard paste look right.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      if (headerLines.length > 0) {
        ctx.fillStyle = '#111111'
        ctx.font = HEADER_FONT
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        headerLines.forEach((line, i) => {
          ctx.fillText(line, canvas.width / 2, HEADER_PADDING / 2 + i * HEADER_LINE_HEIGHT)
        })
      }

      ctx.drawImage(qrCanvas, 0, headerHeight, size, size)

      setHasOutput(true)
      setStatus({ kind: 'idle' })
    } catch {
      setStatus({ kind: 'error', message: t('errorGenerate') })
      setHasOutput(false)
    }
  }, [content, name, size, t])

  // Auto-regenerate after the user pauses typing/changing options.
  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }
    debounceRef.current = window.setTimeout(() => {
      void generate()
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [generate])

  // Ctrl+Enter shortcut to generate immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void generate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [generate])

  const downloadAs = (type: 'image/png' | 'image/jpeg') => {
    const canvas = outputCanvasRef.current
    if (!canvas || !hasOutput) return
    const ext = type === 'image/png' ? 'png' : 'jpg'
    const filename = `${(name.trim() || 'qrcode').replace(/[^\w-]+/g, '-')}.${ext}`
    const url = canvas.toDataURL(type, 0.92)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  }

  const copyToClipboard = async () => {
    const canvas = outputCanvasRef.current
    if (!canvas || !hasOutput) return
    try {
      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) return reject(new Error('toBlob failed'))
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            resolve()
          } catch (err) {
            reject(err)
          }
        }, 'image/png')
      })
      setStatus({ kind: 'success', message: t('copySuccess') })
    } catch {
      setStatus({ kind: 'error', message: t('copyFail') })
    }
  }

  const inputClass =
    'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:ring-primary-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300'

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-5">
        <div>
          <label htmlFor="qr-name" className={labelClass}>
            {t('nameLabel')}
          </label>
          <input
            id="qr-name"
            type="text"
            maxLength={MAX_NAME}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            className={inputClass}
          />
          <div className="mt-1 text-right text-xs text-gray-500">
            {t('charCount', { count: name.length, max: MAX_NAME })}
          </div>
        </div>

        <div>
          <label htmlFor="qr-content" className={labelClass}>
            {t('contentLabel')}
          </label>
          <textarea
            id="qr-content"
            rows={5}
            maxLength={MAX_CONTENT}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('contentPlaceholder')}
            className={`${inputClass} resize-y`}
          />
          <div className="mt-1 text-right text-xs text-gray-500">
            {t('charCount', { count: content.length, max: MAX_CONTENT })}
          </div>
        </div>

        <div>
          <label htmlFor="qr-size" className={labelClass}>
            {t('sizeLabel')}
          </label>
          <select
            id="qr-size"
            value={size}
            onChange={(e) => setSize(Number(e.target.value) as (typeof SIZES)[number])}
            className={inputClass}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}px
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={generate}
          className="bg-primary-500 hover:bg-primary-600 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white transition-colors"
        >
          {t('generate')}
        </button>

        <p className="text-xs text-gray-500">{t('shortcutHint')}</p>

        {status.kind !== 'idle' && status.message && (
          <p
            role="status"
            className={
              status.kind === 'error'
                ? 'rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
                : 'rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300'
            }
          >
            {status.message}
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full items-center justify-center rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <canvas
            ref={outputCanvasRef}
            className={hasOutput ? 'max-w-full rounded' : 'hidden'}
            aria-label={t('title')}
          />
          {!hasOutput && (
            <div className="text-center text-sm text-gray-400">
              {t('contentPlaceholder')}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={!hasOutput}
            onClick={copyToClipboard}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            {t('copy')}
          </button>
          <button
            type="button"
            disabled={!hasOutput}
            onClick={() => downloadAs('image/png')}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            {t('downloadPng')}
          </button>
          <button
            type="button"
            disabled={!hasOutput}
            onClick={() => downloadAs('image/jpeg')}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            {t('downloadJpeg')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default QRGenerator
