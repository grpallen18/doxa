import type { NeoDocumentGraph } from '@/lib/neo4j/queries/phase0'
import {
  getDocumentGraph,
  getDocumentGraphs,
} from '@/lib/neo4j/queries/phase0'

/**
 * Process-local TTL LRU for Phase-0 document graphs.
 * Multi-instance deploys each keep their own cache (fine for admin Neo explorer).
 */
const MAX_ENTRIES = 200
const HIT_TTL_MS = 5 * 60 * 1000
const NULL_TTL_MS = 30 * 1000

type CacheEntry = {
  value: NeoDocumentGraph | null
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

function touch(key: string, entry: CacheEntry): void {
  cache.delete(key)
  cache.set(key, entry)
}

function evictIfNeeded(): void {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function peekDocumentGraphCache(storyId: string): NeoDocumentGraph | null | undefined {
  const entry = cache.get(storyId)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) {
    cache.delete(storyId)
    return undefined
  }
  touch(storyId, entry)
  return entry.value
}

export function setDocumentGraphCache(
  storyId: string,
  value: NeoDocumentGraph | null
): void {
  const ttl = value == null ? NULL_TTL_MS : HIT_TTL_MS
  touch(storyId, { value, expiresAt: Date.now() + ttl })
  evictIfNeeded()
}

export function clearDocumentGraphCache(storyId?: string): void {
  if (storyId) cache.delete(storyId)
  else cache.clear()
}

/**
 * Cached Neo4j document graph fetch. Pass `bypass: true` after ingestion Refresh.
 * In development the cache is always bypassed so hot-reload / multi-browser
 * testing does not serve a stale process-local snapshot.
 */
export async function getDocumentGraphCached(
  storyId: string,
  options?: { bypass?: boolean }
): Promise<NeoDocumentGraph | null> {
  const bypass =
    Boolean(options?.bypass) || process.env.NODE_ENV === 'development'

  if (!bypass) {
    const hit = peekDocumentGraphCache(storyId)
    if (hit !== undefined) return hit
  } else {
    cache.delete(storyId)
  }

  const graph = await getDocumentGraph(storyId)
  if (process.env.NODE_ENV !== 'development') {
    setDocumentGraphCache(storyId, graph)
  }
  return graph
}

/**
 * Batched cache fill — one Neo4j round-trip set for all misses.
 */
export async function getDocumentGraphsCached(
  storyIds: string[],
  options?: { bypass?: boolean }
): Promise<Map<string, NeoDocumentGraph | null>> {
  const bypass =
    Boolean(options?.bypass) || process.env.NODE_ENV === 'development'
  const out = new Map<string, NeoDocumentGraph | null>()
  const misses: string[] = []

  for (const id of storyIds) {
    if (!id) continue
    if (!bypass) {
      const hit = peekDocumentGraphCache(id)
      if (hit !== undefined) {
        out.set(id, hit)
        continue
      }
    } else {
      cache.delete(id)
    }
    misses.push(id)
  }

  if (misses.length === 0) return out

  const fetched = await getDocumentGraphs(misses)
  for (const id of misses) {
    const graph = fetched.get(id) ?? null
    if (process.env.NODE_ENV !== 'development') {
      setDocumentGraphCache(id, graph)
    }
    out.set(id, graph)
  }
  return out
}
