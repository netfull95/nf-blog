// Shared localStorage-backed history of Shopee affiliate links a user has
// generated. Both tools write to and read from the same key:
//   - /tools/shopee-shortlink     (dedicated generator UI + preview enrichment)
//   - /tools/shopee-deals         (URL input at top; "Của tôi" tab)
//
// Client-only module — safe to import from client components. No fetch calls
// live here; the tool components own their own request flows and just use
// this module for CRUD on the shared list.

export const HISTORY_KEY = 'nf-shopee-history'
export const HISTORY_MAX = 50

// Full superset of fields either tool might store. Every field except id,
// cleanUrl, shortLink, createdAt is optional so a minimal entry (from the
// deals-board's paste-and-generate flow) is valid alongside a fully-enriched
// entry (from the shortlink tool's addlivetag preview fetch).
export type SavedShortlink = {
  id: string
  shortLink: string
  cleanUrl: string
  shopId?: string
  itemId?: string
  productName?: string
  imageUrl?: string
  // Buyer-facing product info from addlivetag preview. Commission-related
  // fields (commission, sellerComFinal, isXtra, cap*, etc.) are intentionally
  // NOT stored or displayed — those are internal metrics, not for visitors.
  shopName?: string
  price?: number
  originalPrice?: number
  discountPercent?: number
  flashSale?: boolean
  stockAvailable?: number
  sales?: number
  rating?: number
  minPrice?: number
  createdAt: number
  // 'pending' when a preview fetch hasn't been attempted yet, 'failed' when
  // addlivetag returned no data (product delisted / not in their DB) so we
  // don't re-fetch on every mount. Omitted once we successfully have data.
  previewStatus?: 'pending' | 'failed'
}

// Generate a stable-ish random id; falls back to Date.now+random on browsers
// without crypto.randomUUID (basically none in 2026 but cheap insurance).
export function newHistoryId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random()}`
}

export function loadHistory(): SavedShortlink[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedShortlink[]
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, HISTORY_MAX)
  } catch {
    return []
  }
}

export function saveHistory(next: SavedShortlink[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    /* quota exceeded / blocked — nothing we can do */
  }
}

// addlivetag product-data proxy — returns productName + imageUrl + price +
// rating + sales + discount info for a single item_id. CORS-enabled, so
// clients can call it directly. Rate limit 2000/min from their DB cache.
// Docs: https://github.com/bcat95/shopee-aff/blob/main/product-data-api.md
const PREVIEW_API = 'https://data.addlivetag.com/product-data/product-data.php'

// Fields the preview API can populate on a SavedShortlink. Excludes the
// identity fields (id, cleanUrl, shortLink, createdAt, shopId, itemId).
export type PreviewFields = Pick<
  SavedShortlink,
  | 'productName'
  | 'imageUrl'
  | 'shopName'
  | 'price'
  | 'originalPrice'
  | 'discountPercent'
  | 'flashSale'
  | 'stockAvailable'
  | 'sales'
  | 'rating'
  | 'minPrice'
>

// Fetch preview data for a single itemId. Returns null when the API is
// unreachable or the product isn't in addlivetag's DB (delisted/unknown).
// Returns an empty object when the API responds but has no useful fields —
// caller can still record "we tried" via previewStatus.
export async function fetchProductPreview(
  itemId: string | number
): Promise<PreviewFields | null> {
  try {
    const res = await fetch(`${PREVIEW_API}?item_id=${encodeURIComponent(String(itemId))}`)
    if (!res.ok) return null
    const json = (await res.json()) as {
      productInfo?: {
        productName?: string | null
        imageUrl?: string | null
        shopName?: string | null
        price?: number | null
        sales?: number | null
        rating?: string | number | null
        latestPriceHistory?: {
          originalPrice?: number | null
          discountPercent?: number | null
          flashSale?: boolean | null
          stockAvailable?: number | null
        } | null
        priceStats?: { minPrice?: number | null } | null
      }
    }
    const info = json.productInfo || {}
    const preview: PreviewFields = {
      productName: info.productName || undefined,
      imageUrl: info.imageUrl || undefined,
      shopName: info.shopName || undefined,
      price: typeof info.price === 'number' && info.price > 0 ? info.price : undefined,
      sales: typeof info.sales === 'number' && info.sales > 0 ? info.sales : undefined,
      rating:
        info.rating != null && info.rating !== '' ? Number(info.rating) : undefined,
      originalPrice:
        info.latestPriceHistory?.originalPrice &&
        info.latestPriceHistory.originalPrice > 0
          ? info.latestPriceHistory.originalPrice
          : undefined,
      discountPercent:
        info.latestPriceHistory?.discountPercent &&
        info.latestPriceHistory.discountPercent > 0
          ? info.latestPriceHistory.discountPercent
          : undefined,
      flashSale: info.latestPriceHistory?.flashSale === true || undefined,
      stockAvailable:
        typeof info.latestPriceHistory?.stockAvailable === 'number'
          ? info.latestPriceHistory.stockAvailable
          : undefined,
      minPrice:
        typeof info.priceStats?.minPrice === 'number' && info.priceStats.minPrice > 0
          ? info.priceStats.minPrice
          : undefined,
    }
    const anyFound = Object.values(preview).some((v) => v !== undefined)
    return anyFound ? preview : {}
  } catch {
    return null
  }
}

// LIFO insert with dedup by cleanUrl. If the same product exists, merge:
// keep any preview fields from the old entry that the new entry doesn't
// have (so re-shortening a product doesn't clobber its previously-fetched
// title/image/etc.).
export function addToHistory(
  entry: SavedShortlink,
  prev: SavedShortlink[]
): SavedShortlink[] {
  const existing = prev.find((h) => h.cleanUrl === entry.cleanUrl)
  const merged: SavedShortlink = existing
    ? {
        ...existing,
        ...entry,
        productName: entry.productName || existing.productName,
        imageUrl: entry.imageUrl || existing.imageUrl,
        shopName: entry.shopName || existing.shopName,
        price: entry.price ?? existing.price,
        originalPrice: entry.originalPrice ?? existing.originalPrice,
        discountPercent: entry.discountPercent ?? existing.discountPercent,
        flashSale: entry.flashSale ?? existing.flashSale,
        stockAvailable: entry.stockAvailable ?? existing.stockAvailable,
        sales: entry.sales ?? existing.sales,
        rating: entry.rating ?? existing.rating,
        minPrice: entry.minPrice ?? existing.minPrice,
        // Reset previewStatus so the shortlink tool re-attempts enrichment
        // on remount if the old entry was marked 'failed' but new data
        // showed up meanwhile.
        previewStatus: undefined,
      }
    : entry
  const withoutDupe = prev.filter((h) => h.cleanUrl !== entry.cleanUrl)
  return [merged, ...withoutDupe].slice(0, HISTORY_MAX)
}
