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
    lines.push('', '*Pro (AFFIRMS / yes-side)*', context.pro_answer_statement)
  }
  if (context.con_answer_statement) {
    lines.push('', '*Con (DENIES / no-side)*', context.con_answer_statement)
  }

  if (context.founding_props.length) {
    lines.push('', '*Founding propositions*')
    for (const prop of context.founding_props) {
      const who = [prop.speaker, prop.publication].filter(Boolean).join(' · ')
      const head = who ? `*${who}*` : `*${prop.prop_uid}*`
      lines.push(`• ${head}`, `  "${excerpt(prop.segment_text ?? prop.text)}"`)
      if (prop.document_url) {
        const label =
          [prop.publication, prop.document_title].filter(Boolean).join(' — ') ||
          'Source story'
        lines.push(`  ${slackLink(prop.document_url, label)}`)
      }
    }
  }

  if (context.source_links.length) {
    lines.push('', '*Sources*')
    for (const link of context.source_links) {
      const label =
        [link.publication, link.title].filter(Boolean).join(' — ') || link.url
      lines.push(`• ${slackLink(link.url, label)}`)
    }
  }

  if (context.overall_rationale) {
    lines.push('', '*Curator rationale*', context.overall_rationale.slice(0, 900))
  }

  return lines.join('\n')
}
