'use client'

import { Comments as CommentsComponent } from 'pliny/comments'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { giscusComments } from '@/lib/comments'

export default function Comments({ slug }: { slug: string }) {
  const [loadComments, setLoadComments] = useState(false)
  const locale = useLocale()
  const t = useTranslations('Post')

  if (!giscusComments) {
    return null
  }
  const commentsConfig = {
    ...giscusComments,
    giscusConfig: { ...giscusComments.giscusConfig, lang: locale },
  }
  return (
    <>
      {loadComments ? (
        <CommentsComponent commentsConfig={commentsConfig} slug={slug} />
      ) : (
        <button
          onClick={() => setLoadComments(true)}
          className="hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium dark:border-gray-600"
        >
          {t('loadComments')}
        </button>
      )}
    </>
  )
}
