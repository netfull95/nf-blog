import siteMetadata from '@/data/siteMetadata'

const comments = siteMetadata.comments

// Giscus only works once its NEXT_PUBLIC_GISCUS_* env vars are set, so hide every
// comment entry point until then instead of rendering a broken widget.
export const giscusComments =
  comments?.provider === 'giscus' && comments.giscusConfig.repo ? comments : undefined

export const commentsEnabled = Boolean(giscusComments)
