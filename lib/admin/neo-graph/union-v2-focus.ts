export const NEO_UNION_PATH = '/admin/neo/union'

/** @deprecated Use NEO_UNION_PATH */
export const UNION_V2_PATH = NEO_UNION_PATH

export function neoUnionHref(focus?: string | null): string {
  if (!focus) return NEO_UNION_PATH
  return `${NEO_UNION_PATH}?focus=${encodeURIComponent(focus)}`
}

/** @deprecated Use neoUnionHref */
export function unionV2Href(focus?: string | null): string {
  return neoUnionHref(focus)
}

export function neoUnionDocumentHref(documentUid: string): string {
  return neoUnionHref(`document:${documentUid}`)
}

/** @deprecated Use neoUnionDocumentHref */
export function unionV2DocumentHref(documentUid: string): string {
  return neoUnionDocumentHref(documentUid)
}

export function neoUnionControversyHref(uid: string): string {
  return neoUnionHref(`controversy:${uid}`)
}

/** @deprecated Use neoUnionControversyHref */
export function unionV2ControversyHref(uid: string): string {
  return neoUnionControversyHref(uid)
}

export function neoUnionNodeHref(
  kind: 'document' | 'controversy' | 'proposition' | 'entity',
  uid: string
): string {
  return neoUnionHref(`${kind}:${uid}`)
}

/** @deprecated Use neoUnionNodeHref */
export function unionV2NodeHref(
  kind: 'document' | 'controversy' | 'proposition' | 'entity',
  uid: string
): string {
  return neoUnionNodeHref(kind, uid)
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
