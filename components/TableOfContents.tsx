'use client'

import { useEffect, useMemo, useState } from 'react'

export type TocItem = { value: string; url: string; depth: number }

// Sticky "On this page" list with the current section highlighted.
export default function TableOfContents({ toc, title }: { toc: TocItem[]; title: string }) {
  const items = useMemo(() => toc.filter((item) => item.depth >= 2 && item.depth <= 3), [toc])
  const [activeId, setActiveId] = useState<string>()

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(decodeURIComponent(item.url.slice(1))))
      .filter((el): el is HTMLElement => !!el)
    if (!headings.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length) setActiveId(visible[0].target.id)
      },
      // Treat a heading as current once it reaches the top ~20% of the viewport.
      { rootMargin: '-80px 0px -75% 0px' }
    )
    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [items])

  if (!items.length) return null
  return (
    <nav aria-label={title}>
      <h2 className="mb-3 text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {title}
      </h2>
      <ul className="space-y-2 text-sm leading-5">
        {items.map((item) => {
          const id = decodeURIComponent(item.url.slice(1))
          const active = id === activeId
          return (
            <li key={item.url} className={item.depth === 3 ? 'pl-3' : undefined}>
              <a
                href={item.url}
                className={
                  active
                    ? 'text-primary-600 dark:text-primary-400 font-semibold'
                    : 'hover:text-primary-600 dark:hover:text-primary-400 text-gray-600 dark:text-gray-400'
                }
              >
                {item.value}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
