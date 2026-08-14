import {
  NEO_KIND_TO_LABEL,
  parseNeoNodeId,
} from '@/lib/admin/neo-graph/node-id'
import type { NeoNodeKind } from '@/lib/admin/neo-graph/types'
import { withNeo4jSession } from '@/lib/neo4j/server'

export type NeoNodeDetail = {
  id: string
  kind: NeoNodeKind
  label: string
  properties: Record<string, string | number | boolean | null>
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value == null) return null
  return String(value)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function flattenProps(
  raw: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) {
      out[key] = null
      continue
    }
    if (typeof value === 'boolean') {
      out[key] = value
      continue
    }
    const n = asNumber(value)
    if (n != null && typeof value !== 'string') {
      out[key] = n
      continue
    }
    out[key] = asString(value)
  }
  return out
}

function labelOf(kind: NeoNodeKind, props: Record<string, unknown>): string {
  const title = asString(props.title)
  const name = asString(props.name)
  const text = asString(props.text)
  const summary = asString(props.summary)
  const label = asString(props.label)
  return (label || title || name || text || summary || kind).slice(0, 240)
}

export async function getNeoNodeDetail(
  nodeId: string
): Promise<NeoNodeDetail | null> {
  const parsed = parseNeoNodeId(nodeId)
  if (!parsed || parsed.kind === 'cluster') return null
  const label = NEO_KIND_TO_LABEL[parsed.kind]
  if (!label) return null

  return withNeo4jSession(async (session) => {
    const result = await session.run(
      `
      MATCH (n)
      WHERE n.uid = $uid AND $label IN labels(n)
      RETURN n
      LIMIT 1
      `,
      { uid: parsed.uid, label }
    )
    const rec = result.records[0]
    if (!rec) return null
    const node = rec.get('n') as { properties?: Record<string, unknown> } | null
    const props = node?.properties ?? {}
    const flat = flattenProps(props)
    if (!flat.uid) flat.uid = parsed.uid
    return {
      id: nodeId,
      kind: parsed.kind,
      label: labelOf(parsed.kind, props),
      properties: flat,
    }
  })
}
