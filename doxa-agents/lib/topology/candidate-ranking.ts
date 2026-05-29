export function capTopKPerAnchor<T>(
  items: T[],
  anchorKey: (item: T) => string,
  scoreKey: (item: T) => number,
  k: number
): T[] {
  const byAnchor = new Map<string, T[]>();
  for (const item of items) {
    const key = anchorKey(item);
    if (!byAnchor.has(key)) byAnchor.set(key, []);
    byAnchor.get(key)!.push(item);
  }
  const kept: T[] = [];
  const seen = new Set<string>();
  for (const group of byAnchor.values()) {
    group.sort((a, b) => scoreKey(b) - scoreKey(a));
    for (const item of group.slice(0, k)) {
      kept.push(item);
    }
  }
  kept.sort((a, b) => scoreKey(b) - scoreKey(a));
  return kept;
}

export function dedupePairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function uniquePairs<T extends { a: string; b: string }>(
  items: T[],
  seen: Set<string> = new Set()
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const key = dedupePairKey(item.a, item.b);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
