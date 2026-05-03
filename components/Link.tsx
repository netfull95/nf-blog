/* eslint-disable jsx-a11y/anchor-has-content */
import type { ComponentProps } from 'react'
import { Link as IntlLink } from '@/i18n/navigation'

type IntlLinkProps = ComponentProps<typeof IntlLink>
type CustomLinkProps = Omit<IntlLinkProps, 'href'> & { href: string }

const CustomLink = ({ href, ...rest }: CustomLinkProps) => {
  const isInternalLink = href.startsWith('/')
  const isAnchorLink = href.startsWith('#')

  if (isInternalLink) {
    // IntlLink automatically prepends the current locale prefix when needed.
    return <IntlLink className="break-words" href={href} {...rest} />
  }

  if (isAnchorLink) {
    return <a className="break-words" href={href} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)} />
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
