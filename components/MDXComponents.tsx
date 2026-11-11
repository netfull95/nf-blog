import TOCInline from 'pliny/ui/TOCInline'
import Pre from 'pliny/ui/Pre'
import BlogNewsletterForm from 'pliny/ui/BlogNewsletterForm'
import type { MDXComponents } from 'mdx/types'
import Image from './Image'
import CustomLink from './Link'
import TableWrapper from './TableWrapper'
import Link from 'next/link'

export const components: MDXComponents = {
  Image,
  TOCInline,
  // Root-relative URLs in authored content are exact destinations: /blog/...
  // may intentionally reference a Vietnamese article from an English post.
  a: ({ href = '', ...props }) =>
    href.startsWith('/') && !href.startsWith('//') ? (
      <Link href={href} className="break-words" {...props} />
    ) : (
      <CustomLink href={href} {...props} />
    ),
  pre: Pre,
  table: TableWrapper,
  BlogNewsletterForm,
}
