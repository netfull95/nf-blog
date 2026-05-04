// Resolve Shopee shortlinks (vn.shp.ee, shp.ee, s.shopee.vn, etc.) to their
// final destination URL. Shopee's affiliate template (an_redir) needs a full
// product URL as origin_link — passing a shortlink yields a broken redirect
// chain.

const SHORTLINK_HOSTS = new Set([
  's.shopee.vn',
  'shp.ee',
  'vn.shp.ee',
  'shope.ee',
  'm.shp.ee',
])

const FETCH_TIMEOUT_MS = 6_000

export function isShortlinkHost(hostname: string): boolean {
  return SHORTLINK_HOSTS.has(hostname.toLowerCase())
}

export async function expandShortlink(url: string): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (!isShortlinkHost(parsed.hostname)) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    // Use HEAD with redirect: 'follow' — fetch returns the final URL after
    // chasing the chain. Some shortlinks reject HEAD; fall back to GET.
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    }).catch(() => null)

    if (!res || (!res.ok && res.status !== 405)) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      }).catch(() => null)
    }
    if (!res) return null

    // Reject if we ended up off-Shopee (defensive).
    const finalUrl = new URL(res.url)
    const finalHost = finalUrl.hostname.toLowerCase()
    if (!finalHost.endsWith('shopee.vn')) return null
    // Reject if we just bounced to another shortlink (shouldn't happen but
    // keep us out of loops).
    if (isShortlinkHost(finalHost)) return null

    return res.url
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
