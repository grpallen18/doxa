export const UNION_V2_PATH = '/admin/neo/union-2'

export function unionV2Href(focus?: string | null): string {
  if (!focus) return UNION_V2_PATH
  return `${UNION_V2_PATH}?focus=${encodeURIComponent(focus)}`
}

export function unionV2DocumentHref(documentUid: string): string {
  return unionV2Href(`document:${documentUid}`)
}

export function unionV2ControversyHref(uid: string): string {
  return unionV2Href(`controversy:${uid}`)
}

export function unionV2NodeHref(
  kind: 'document' | 'controversy' | 'proposition' | 'entity',
  uid: string
): string {
  return unionV2Href(`${kind}:${uid}`)
}

/** Map a `?focus=` value onto a projected node id. */
export function resolveFocusNodeId(
  focus: string | null | undefined,
  nodeIds: Iterable<string>
): string | null {
  const raw = focus?.trim()
  if (!raw) return null
  const set = new Set(nodeIds)
  if (set.has(raw)) return raw
  const candidates = [
    `document:${raw}`,
    `controversy:${raw}`,
    `proposition:${raw}`,
    `entity:${raw}`,
    `publication:${raw}`,
  ]
  for (const id of candidates) {
    if (set.has(id)) return id
  }
  return null
}
