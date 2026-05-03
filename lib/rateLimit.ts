// In-memory sliding-window rate limiter.
// Suitable for single-instance deployments (e.g. PM2 with instances=1).
// For multi-instance / serverless, swap this for a shared store (Redis, Upstash).

type Bucket = number[]

const buckets = new Map<string, Bucket>()
let lastCleanupAt = 0
const CLEANUP_INTERVAL_MS = 60_000

function maybeCleanup(now: number, windowMs: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return
  lastCleanupAt = now
  // Anything older than the longest window we care about is safe to drop.
  const cutoff = now - Math.max(windowMs, CLEANUP_INTERVAL_MS)
  for (const [key, ts] of buckets) {
    const keep = ts.filter((t) => t > cutoff)
    if (keep.length === 0) buckets.delete(key)
    else if (keep.length !== ts.length) buckets.set(key, keep)
  }
}

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; remaining: 0; retryAfterMs: number; resetAt: number }

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  maybeCleanup(now, windowMs)

  const cutoff = now - windowMs
  const ts = buckets.get(key) ?? []
  const fresh = ts.filter((t) => t > cutoff)

  if (fresh.length >= limit) {
    const oldest = fresh[0]
    const retryAfterMs = oldest + windowMs - now
    buckets.set(key, fresh)
    return { ok: false, remaining: 0, retryAfterMs, resetAt: oldest + windowMs }
  }

  fresh.push(now)
  buckets.set(key, fresh)
  return { ok: true, remaining: limit - fresh.length, resetAt: fresh[0] + windowMs }
}

export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
