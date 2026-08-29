/**
 * Rich mint approval context for Slack cards and admin review.
 */

import { withNeo4jSession, getNeo4jConfig } from '@/lib/neo4j/server'
import type { MembershipOp } from '@/doxa-agents/lib/debate/proposal-ops'
import {
  fetchPropositionContexts,
  uniqueSourceLinks,
  type MintReviewSourceLink,
  type PropositionSourceContext,
} from '@/doxa-agents/lib/debate/proposition-context'

export type MintApprovalContext = {
  question_text: string | null
  pro_answer_statement: string | null
  con_answer_statement: string | null
  overall_rationale: string
  founding_props: PropositionSourceContext[]
  source_links: MintReviewSourceLink[]
}

function mintOpFromPayload(payload: Record<string, unknown>): MembershipOp | null {
  const ops = Array.isArray(payload.ops) ? payload.ops : []
  for (const raw of ops) {
    if (!raw || typeof raw !== 'object') continue
    const op = raw as Record<string, unknown>
    if (String(op.type ?? '').toUpperCase() === 'MINT_QUESTION') {
      return op as unknown as MembershipOp
    }
  }
  return null
}

function propUidsFromPayload(payload: Record<string, unknown>): string[] {
  const fromCluster = Array.isArray(payload.cluster_prop_uids)
    ? payload.cluster_prop_uids.map((x) => String(x)).filter(Boolean)
    : []
  const mint = mintOpFromPayload(payload)
  const fromAnchor = mint?.prop_uid ? [mint.prop_uid] : []
  return [...new Set([...fromCluster, ...fromAnchor])]
}

async function neoQuery<T extends Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  return withNeo4jSession(async (session) => {
    const result = await session.run(cypher, params)
    return result.records.map((rec) => rec.toObject() as T)
  })
}

export async function loadMintApprovalContext(
  payload: Record<string, unknown>
): Promise<MintApprovalContext> {
  const mint = mintOpFromPayload(payload)
  const overall_rationale = String(payload.overall_rationale ?? payload.note ?? '').trim()
  const question_text =
    mint?.new_question_text?.trim() ||
    (typeof payload.new_question_text === 'string' ? payload.new_question_text.trim() : null) ||
    null

  const base: MintApprovalContext = {
    question_text,
    pro_answer_statement: mint?.pro_answer_statement?.trim() ?? null,
    con_answer_statement: mint?.con_answer_statement?.trim() ?? null,
    overall_rationale,
    founding_props: [],
    source_links: [],
  }

  if (!getNeo4jConfig()) return base

  const propUids = propUidsFromPayload(payload)
  if (!propUids.length) return base

  try {
    const founding_props = await fetchPropositionContexts(neoQuery, propUids)
    return {
      ...base,
      founding_props,
      source_links: uniqueSourceLinks(founding_props),
    }
  } catch {
    return base
  }
}

function excerpt(text: string | null | undefined, max = 220): string {
  const s = String(text ?? '').trim().replace(/\s+/g, ' ')
  if (!s) return '_(no excerpt)_'
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function slackLink(url: string, label: string): string {
  const safeUrl = url.replace(/[>|]/g, '')
  const safeLabel = label.replace(/[<>]/g, '')
  return `<${safeUrl}|${safeLabel}>`
}

function escapeMrkdwn(text: string): string {
  return text.replace(/[<>]/g, '')
}

type EvidenceGroup = {
  url: string | null
  publication: string | null
  title: string | null
  props: PropositionSourceContext[]
}

function groupEvidenceBySource(props: PropositionSourceContext[]): EvidenceGroup[] {
  const groups: EvidenceGroup[] = []
  const indexByKey = new Map<string, number>()
  for (const prop of props) {
    const url = prop.document_url?.trim() || null
    const key = url || `uid:${prop.document_uid ?? prop.prop_uid}`
    const existing = indexByKey.get(key)
    if (existing != null) {
      groups[existing].props.push(prop)
      continue
    }
    indexByKey.set(key, groups.length)
    groups.push({
      url,
      publication: prop.publication,
      title: prop.document_title,
      props: [prop],
    })
  }
  return groups
}

function sourceHeading(group: EvidenceGroup): string {
  const label =
    [group.publication, group.title].filter(Boolean).join(' — ') || 'Source story'
  if (group.url) return slackLink(group.url, label)
  return `*${escapeMrkdwn(label)}*`
}

const URL_RE = /https?:\/\/[^\s)\]>]+/gi

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sourceCitations(context: MintApprovalContext): {
  urls: string[]
  publications: string[]
} {
  const urls = new Set<string>()
  const publications = new Set<string>()
  for (const prop of context.founding_props) {
    if (prop.document_url?.trim()) urls.add(prop.document_url.trim())
    if (prop.publication?.trim()) publications.add(prop.publication.trim())
  }
  for (const link of context.source_links) {
    if (link.url?.trim()) urls.add(link.url.trim())
    if (link.publication?.trim()) publications.add(link.publication.trim())
  }
  return { urls: [...urls], publications: [...publications] }
}

/** Drop URLs and parenthetical outlet citations already shown in Evidence. */
export function stripRationaleSourceNoise(
  text: string,
  knownUrls: string[] = [],
  publications: string[] = []
): string {
  let out = text.trim()
  const urls = [...knownUrls].sort((a, b) => b.length - a.length)
  for (const url of urls) {
    if (!url) continue
    out = out.split(url).join('')
  }
  out = out.replace(URL_RE, '')
  out = out.replace(/,\s*\)/g, ')')
  out = out.replace(/\(\s*,/g, '(')
  const pubs = [...publications].filter((p) => p.length >= 3).sort((a, b) => b.length - a.length)
  for (const pub of pubs) {
    const escaped = escapeRegExp(pub)
    out = out.replace(new RegExp(`\\(\\s*${escaped}\\s*\\)`, 'gi'), '')
  }
  out = out.replace(/\(\s*[,;]?\s*\)/g, '')
  out = out.replace(/\[\s*\]/g, '')
  out = out.replace(/\s+([,;])/g, '$1')
  out = out.replace(/([,;]){2,}/g, '$1')
  out = out.replace(/\s{2,}/g, ' ')
  out = out.replace(/\s+([.!?])/g, '$1')
  return out.trim()
}

function clipAtSentence(text: string, max: number): string {
  const s = text.trim()
  if (s.length <= max) return s
  const sliced = s.slice(0, max)
  const sentence = Math.max(
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf('? '),
    sliced.lastIndexOf('! ')
  )
  const cut = sentence >= max * 0.45 ? sentence + 1 : Math.max(sliced.lastIndexOf(' '), 0)
  const head = (cut > 40 ? sliced.slice(0, cut) : sliced).trim()
  return `${head}…`
}

export function formatMintApprovalSlackText(opts: {
  kind: string
  payload: Record<string, unknown>
  context: MintApprovalContext
}): string {
  const { kind, context } = opts
  const lines: string[] = [`*${kind}* — human approval required`]

  if (context.question_text) {
    lines.push('', '*Question*', context.question_text)
  }
  if (context.pro_answer_statement) {
    lines.push('', '*Pro*', context.pro_answer_statement)
  }
  if (context.con_answer_statement) {
    lines.push('', '*Con*', context.con_answer_statement)
  }

  if (context.founding_props.length) {
    lines.push('', '*Evidence*')
    const groups = groupEvidenceBySource(context.founding_props)
    for (let i = 0; i < groups.length; i++) {
      if (i > 0) lines.push('')
      const group = groups[i]
      if (!group) continue
      lines.push(sourceHeading(group))
      for (const prop of group.props) {
        const who = escapeMrkdwn(prop.speaker?.trim() || prop.prop_uid)
        lines.push(`• *${who}:* "${excerpt(prop.segment_text ?? prop.text)}"`)
      }
    }
  } else if (context.source_links.length) {
    lines.push('', '*Sources*')
    for (const link of context.source_links) {
      const label =
        [link.publication, link.title].filter(Boolean).join(' — ') || link.url
      lines.push(`• ${slackLink(link.url, label)}`)
    }
  }

  if (context.overall_rationale) {
    const citations = sourceCitations(context)
    const cleaned = stripRationaleSourceNoise(
      context.overall_rationale,
      citations.urls,
      citations.publications
    )
    if (cleaned) {
      lines.push('', '*Why mint*', clipAtSentence(cleaned, 2400))
    }
  }

  return lines.join('\n')
}
