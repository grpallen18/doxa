type CacheEntry<T> = {
  value: T
  expiresAt: number
}

const stores = new Map<string, CacheEntry<unknown>>()

/** Process-local TTL cache for admin metrics (short-lived, admin-only). */
export async function withTtlCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now()
  const hit = stores.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expiresAt > now) {
    return hit.value
  }

  const value = await loader()
  stores.set(key, { value, expiresAt: now + ttlMs })
  return value
}

export function clearTtlCache(key?: string): void {
  if (key) stores.delete(key)
  else stores.clear()
}
