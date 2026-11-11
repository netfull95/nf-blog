/* eslint-disable jsx-a11y/anchor-has-content */
import type { ComponentProps } from 'react'
import { Link as IntlLink } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

type IntlLinkProps = ComponentProps<typeof IntlLink>
type CustomLinkProps = Omit<IntlLinkProps, 'href'> & { href: string }

const CustomLink = ({ href, ...rest }: CustomLinkProps) => {
  const isInternalLink = href.startsWith('/') && !href.startsWith('//')
  const isAnchorLink = href.startsWith('#')

  if (isInternalLink) {
    // MDX may already specify the target locale. Strip it before IntlLink
    // adds the prefix, and preserve explicit cross-language destinations.
    const locale = routing.locales.find((candidate) =>
      new RegExp(`^/${candidate}(?=/|[?#]|$)`).test(href)
    )
    if (locale) {
      const path = href.slice(locale.length + 1)
      const localizedPath = path.startsWith('/') ? path : `/${path}`
      return <IntlLink className="break-words" {...rest} href={localizedPath} locale={locale} />
    }
    // IntlLink automatically prepends the current locale prefix when needed.
    return <IntlLink className="break-words" href={href} {...rest} />
  }

  if (isAnchorLink) {
    return (
      <a
        className="break-words"
        href={href}
        {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
      />
    )
  }

  return (
    <a
      className="break-words"
      target="_blank"
      rel="noopener noreferrer"
      href={href}
      {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
    />
  )
}

export default CustomLink
