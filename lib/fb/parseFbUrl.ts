// Parses Facebook profile/page URLs into a normalized shape.
// Always succeeds for any FB-host URL; returns whatever it can extract.

export type FbUrlInfo = {
  username?: string // vanity handle like "zuck"
  numericId?: string // global_id, e.g. profile.php?id=... or /people/x/<id>/
  canonical: string // canonicalized facebook.com URL we'll use to fetch
  kind: 'profile' | 'page' | 'unknown'
}

const FB_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'mbasic.facebook.com',
  'web.facebook.com',
  'fb.com',
  'fb.me',
])

export function isFbHost(host: string): boolean {
  const h = host.toLowerCase()
  if (FB_HOSTS.has(h)) return true
  return [...FB_HOSTS].some((f) => h.endsWith('.' + f))
}

export function parseFbUrl(input: string): FbUrlInfo {
  let raw = input.trim()
  if (!raw) throw new Error('EMPTY')
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('INVALID_URL')
  }
  if (!isFbHost(parsed.hostname)) throw new Error('NOT_FACEBOOK')

  const pathname = parsed.pathname.replace(/\/+$/, '') // strip trailing slash

  // 1) profile.php?id=XXXX
  if (pathname.toLowerCase().includes('/profile.php')) {
    const id = parsed.searchParams.get('id') ?? undefined
    return {
      numericId: id,
      canonical: id
        ? `https://www.facebook.com/profile.php?id=${id}`
        : `https://www.facebook.com${pathname}`,
      kind: 'profile',
    }
  }

  // 2) /people/<Display-Name>/<numeric-id>/
  const peopleMatch = pathname.match(/^\/people\/[^/]+\/(\d+)/i)
  if (peopleMatch) {
    return {
      numericId: peopleMatch[1],
      canonical: `https://www.facebook.com${pathname}`,
      kind: 'profile',
    }
  }

  // 3) /pages/<Display-Name>/<numeric-id>
  const pagesMatch = pathname.match(/^\/pages\/[^/]+\/(\d+)/i)
  if (pagesMatch) {
    return {
      numericId: pagesMatch[1],
      canonical: `https://www.facebook.com${pathname}`,
      kind: 'page',
    }
  }

  // 4) /<vanity-username>[/...] — must be the FIRST segment, must be a valid handle
  const vanityMatch = pathname.match(/^\/([A-Za-z0-9._-]{2,})(?:\/|$)/)
  if (vanityMatch) {
    const username = vanityMatch[1]
    // Skip routes that aren't user/page handles
    const blacklist = new Set([
      'photo', 'photos', 'video', 'videos', 'watch', 'groups', 'events',
      'marketplace', 'gaming', 'reel', 'reels', 'stories', 'help', 'login',
      'sharer', 'plugins', 'tr', 'p', 'me', 'home.php', 'business',
    ])
    if (blacklist.has(username.toLowerCase())) throw new Error('PARSE_FAILED')
    return {
      username,
      canonical: `https://www.facebook.com/${username}`,
      kind: 'unknown', // we can't tell profile vs page from URL alone
    }
  }

  throw new Error('PARSE_FAILED')
}
