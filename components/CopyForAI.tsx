'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

type Status = 'idle' | 'copied' | 'error'

// Copies the post as Markdown (served by app/api/blog/markdown) so readers can
// paste it into ChatGPT / Claude as context.
export default function CopyForAI({ slug }: { slug: string }) {
  const t = useTranslations('Post')
  const [status, setStatus] = useState<Status>('idle')
  const markdownUrl = `/api/blog/markdown/${slug}`

  const copy = async () => {
    const text = fetch(markdownUrl).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.text()
    })
    try {
      // Safari only allows clipboard writes started synchronously in the click
      // handler, so hand it a promise via ClipboardItem when available.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        const blob = text.then((s) => new Blob([s], { type: 'text/plain' }))
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
      } else {
        await navigator.clipboard.writeText(await text)
      }
      setStatus('copied')
    } catch {
      setStatus('error')
    }
    setTimeout(() => setStatus('idle'), 2000)
  }

  return (
    <span className="inline-flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={copy}
        className="hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 rounded-md border border-gray-300 px-3 py-1 font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300"
      >
        {status === 'copied'
          ? t('copiedForAI')
          : status === 'error'
            ? t('copyForAIError')
            : t('copyForAI')}
      </button>
      <a
        href={markdownUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-primary-600 dark:hover:text-primary-400 text-gray-500 dark:text-gray-400"
      >
        {t('viewMarkdown')}
      </a>
    </span>
  )
}
