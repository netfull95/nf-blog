'use client'

import { isValidElement, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

// Languages rehype-prism-plus falls back to; showing a label for them adds noise.
const hiddenLanguages = ['text', 'plain', 'txt']

const getLanguage = (children: ReactNode) => {
  if (!isValidElement<{ className?: string }>(children)) return null
  const match = children.props.className?.match(/language-([\w-]+)/)
  return match && !hiddenLanguages.includes(match[1]) ? match[1] : null
}

const CodeBlock = ({ children }: { children: ReactNode }) => {
  const t = useTranslations('Common')
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const language = getLanguage(children)

  const onCopy = async () => {
    await navigator.clipboard.writeText(preRef.current?.textContent ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block relative my-6 overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-1.5 text-xs text-gray-400">
        <span className="font-mono uppercase">{language ?? ''}</span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={t('copyCode')}
          className={`rounded px-2 py-0.5 font-medium transition-colors hover:bg-gray-700 hover:text-gray-100 ${copied ? 'text-green-400' : ''}`}
        >
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <pre ref={preRef} className="!my-0 !rounded-none">
        {children}
      </pre>
    </div>
  )
}

export default CodeBlock
