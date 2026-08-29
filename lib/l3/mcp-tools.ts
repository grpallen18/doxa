import { createAdminClient } from '@/lib/supabase/server'
import { runL3Cypher } from '@/lib/l3/neo-query'
import {
  getControversyDossier,
  getCounterSideCandidates,
  getMergeCandidates,
  getQuestionDossier,
  searchQuestions,
} from '../../doxa-agents/lib/debate/dossier'
import { initialProposalStatus, normalizeOp } from '../../doxa-agents/lib/debate/proposal-ops'
import { notifyPendingProposal } from '../../doxa-agents/lib/debate/notify-approval'
import { botMayCallTool } from '@/lib/l3/mcp-allowlist'
import type { L3Bot } from '@/lib/l3/mcp-auth'
import fs from 'node:fs'
import path from 'node:path'

export const MCP_TOOLS = [
  {
    name: 'claim_review_batch',
    description: 'Lease pending L3 review items',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'get_question_dossier',
    description: 'Read a question neighborhood with members, candidates, provenance',
    inputSchema: {
      type: 'object',
      properties: { question_uid: { type: 'string' } },
      required: ['question_uid'],
    },
  },
  {
    name: 'get_controversy_dossier',
    description: 'Read an assembled controversy plus its question dossier',
    inputSchema: {
      type: 'object',
      properties: { controversy_uid: { type: 'string' } },
      required: ['controversy_uid'],
    },
  },
  {
    name: 'get_proposition',
    description: 'Proposition with utterance/segment provenance',
    inputSchema: {
      type: 'object',
      properties: { uid: { type: 'string' } },
      required: ['uid'],
    },
  },
  {
    name: 'get_merge_candidates',
    description: 'Sibling questions that may be the same decision',
    inputSchema: {
      type: 'object',
      properties: { question_uid: { type: 'string' } },
      required: ['question_uid'],
    },
  },
  {
    name: 'get_counter_side_candidates',
    description: 'Propositions that look like the missing opposing side',
    inputSchema: {
      type: 'object',
      properties: { question_uid: { type: 'string' } },
      required: ['question_uid'],
    },
  },
  {
    name: 'list_onesided_questions',
    description:
      'DEPRECATED. Prefer claim_lead_request. One-sided questions with expectedCounterThesis.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number' } },
    },
  },
  {
    name: 'search_questions',
    description: 'Substring search over the question registry',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, k: { type: 'number' } },
      required: ['text'],
    },
  },
  {
    name: 'get_gold_examples',
    description: 'Question grain contract examples',
    inputSchema: { type: 'object', properties: { kind: { type: 'string' } } },
  },
  {
    name: 'submit_membership_proposal',
    description: 'Submit curator membership ops (proposal only)',
    inputSchema: { type: 'object', additionalProperties: true },
  },
  {
    name: 'submit_viewpoint_proposal',
    description: 'Submit editor viewpoint clusters (proposal only)',
    inputSchema: { type: 'object', additionalProperties: true },
  },
  {
    name: 'submit_audit_verdict',
    description: 'Submit auditor pass/block (proposal only)',
    inputSchema: { type: 'object', additionalProperties: true },
  },
  {
    name: 'submit_source_lead',
    description:
      'DEPRECATED. Prefer submit_lead_candidate. Queues a URL for human/Slack approval (does not ingest immediately).',
    inputSchema: {
      type: 'object',
      properties: {
        question_uid: { type: 'string' },
        url: { type: 'string' },
        title: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['question_uid', 'url'],
    },
  },
  {
    name: 'report_blocked',
    description: 'Return a leased item to pending or mark blocked',
    inputSchema: {
      type: 'object',
      properties: {
        lease_id: { type: 'string' },
        item_id: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  },
  {
    name: 'release_review_batch',
    description: 'Release an unexpired lease back to pending',
    inputSchema: {
      type: 'object',
      properties: { lease_id: { type: 'string' } },
      required: ['lease_id'],
    },
  },
  {
    name: 'claim_lead_request',
    description: 'Lease the next pending lead_request for acquisition',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number' } },
    },
  },
  {
    name: 'submit_lead_candidate',
    description: 'Submit a candidate URL for a claimed lead_request (pending Slack approval)',
    inputSchema: {
      type: 'object',
      properties: {
        lead_request_id: { type: 'string' },
        question_uid: { type: 'string' },
        url: { type: 'string' },
        title: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['url', 'question_uid'],
    },
  },
  {
    name: 'submit_approval_verdict',
    description: 'Record an approval verdict for a pending proposal (lead-reviewer)',
    inputSchema: {
      type: 'object',
      properties: {
        proposal_uid: { type: 'string' },
        verdict: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['proposal_uid', 'verdict'],
    },
  },
]

async function audit(bot: L3Bot, tool: string, ok: boolean, detail: unknown) {
  const supabase = createAdminClient()
  await supabase.from('l3_mcp_audit').insert({
    bot_id: bot.bot_id,
    tool,
    ok,
    detail,
  })
}

export async function callMcpTool(
  bot: L3Bot,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (!botMayCallTool(bot.kind, name)) {
    throw new Error(`tool ${name} not allowed for bot kind ${bot.kind}`)
  }
  const supabase = createAdminClient()
  try {
    let result: unknown
    switch (name) {
      case 'claim_review_batch': {
        const { data, error } = await supabase.rpc('claim_l3_review_batch', {
          p_bot_id: bot.bot_id,
          p_kind: String(args.kind ?? 'membership'),
          p_limit: Number(args.limit) || 5,
          p_lease_seconds: 900,
        })
        if (error) throw new Error(error.message)
        result = { items: data ?? [] }
        break
      }
      case 'get_question_dossier':
        result = await getQuestionDossier(runL3Cypher, String(args.question_uid))
        break
      case 'get_controversy_dossier':
        result = await getControversyDossier(runL3Cypher, String(args.controversy_uid))
        break
      case 'get_proposition':
        result = (
          await runL3Cypher(
            `
            MATCH (p:Proposition {uid: $uid})
            OPTIONAL MATCH (p)<-[:EXPRESSES]-(u:Utterance)-[:GROUNDED_IN]->(seg:Segment)
            RETURN p.uid AS uid,
                   coalesce(p.text, p.normalizedText, '') AS text,
                   collect({ utterance_uid: u.uid, segment_text: coalesce(seg.text, u.text) })[0..3] AS utterances
            `,
            { uid: String(args.uid) }
          )
        )[0] ?? null
        break
      case 'get_merge_candidates':
        result = await getMergeCandidates(runL3Cypher, String(args.question_uid))
        break
      case 'get_counter_side_candidates':
        result = await getCounterSideCandidates(runL3Cypher, String(args.question_uid))
        break
      case 'list_onesided_questions':
        result = await runL3Cypher(
          `
          MATCH (q:Question)<-[a:ANSWERS]-(:Proposition)
          WITH q, collect(DISTINCT a.polarity) AS pols
          WHERE size(pols) = 1
          RETURN q.uid AS question_uid,
                 q.question AS question,
                 q.expectedCounterThesis AS expected_counter_thesis,
                 pols[0] AS polarity
          LIMIT toInteger($limit)
          `,
          { limit: Number(args.limit) || 10 }
        )
        break
      case 'search_questions':
        result = await searchQuestions(runL3Cypher, String(args.text), Number(args.k) || 8)
        break
      case 'get_gold_examples': {
        const p = path.join(process.cwd(), 'docs', 'gold', 'question-grain.md')
        result = { markdown: fs.existsSync(p) ? fs.readFileSync(p, 'utf8').slice(0, 8000) : '' }
        break
      }
      case 'submit_membership_proposal': {
        const ops = Array.isArray(args.ops)
          ? args.ops
              .map((o) => normalizeOp((o ?? {}) as Record<string, unknown>))
              .filter((o): o is NonNullable<typeof o> => o != null)
          : []
        const clusterPropUids = Array.isArray(args.cluster_prop_uids)
          ? args.cluster_prop_uids.map((x) => String(x)).filter(Boolean)
          : []
        // A cluster review is a mint item even when the bot declines it with no ops.
        const isMint =
          ops.some((o) => o.type === 'MINT_QUESTION') || clusterPropUids.length > 0
        const proposalUid = `mcp:${bot.bot_id}:${Date.now()}`
        const status = initialProposalStatus(isMint ? 'mint' : 'membership', ops)
        const { error } = await supabase.from('l3_proposals').insert({
          proposal_uid: proposalUid,
          bot_id: bot.bot_id,
          kind: isMint ? 'mint' : 'membership',
          question_uid: args.question_uid ? String(args.question_uid) : null,
          lease_id: args.lease_id ?? null,
          payload: {
            question_uid: args.question_uid,
            overall_rationale: args.overall_rationale ?? '',
            ops,
            item_id: args.item_id ?? null,
            cluster_prop_uids: clusterPropUids.length ? clusterPropUids : undefined,
          },
          status,
        })
        if (error) throw new Error(error.message)
        if (status === 'pending_approval') await notifyPendingProposal(proposalUid)
        result = { proposal_uid: proposalUid, ops: ops.length, status }
        break
      }
      case 'submit_viewpoint_proposal': {
        const proposalUid = `mcpvp:${bot.bot_id}:${Date.now()}`
        const { error } = await supabase.from('l3_proposals').insert({
          proposal_uid: proposalUid,
          bot_id: bot.bot_id,
          kind: 'viewpoint',
          question_uid: args.question_uid ? String(args.question_uid) : null,
          payload: args,
          status: 'submitted',
        })
        if (error) throw new Error(error.message)
        result = { proposal_uid: proposalUid }
        break
      }
      case 'submit_audit_verdict': {
        const proposalUid = `mcpaudit:${bot.bot_id}:${Date.now()}`
        const { error } = await supabase.from('l3_proposals').insert({
          proposal_uid: proposalUid,
          bot_id: bot.bot_id,
          kind: 'audit',
          controversy_uid: args.controversy_uid ? String(args.controversy_uid) : null,
          payload: args,
          status: 'submitted',
        })
        if (error) throw new Error(error.message)
        result = { proposal_uid: proposalUid }
        break
      }
      case 'submit_source_lead':
      case 'submit_lead_candidate': {
        const proposalUid = `lead:${bot.bot_id}:${Date.now()}`
        const leadRequestId = args.lead_request_id ? String(args.lead_request_id) : null
        const { error } = await supabase.from('l3_proposals').insert({
          proposal_uid: proposalUid,
          bot_id: bot.bot_id,
          kind: name === 'submit_lead_candidate' ? 'lead_candidate' : 'source_lead',
          question_uid: String(args.question_uid),
          payload: { ...args, lead_request_id: leadRequestId },
          status: 'pending_approval',
        })
        if (error) throw new Error(error.message)
        if (leadRequestId) {
          const { data: reqRow } = await supabase
            .from('lead_requests')
            .select('request_id, state, claimed_by_bot')
            .eq('request_id', leadRequestId)
            .maybeSingle()
          if (!reqRow) throw new Error('lead_request not found')
          if (reqRow.state === 'fulfilled' || reqRow.state === 'cancelled') {
            throw new Error(`lead_request is ${reqRow.state}`)
          }
          if (
            reqRow.state === 'claimed' &&
            reqRow.claimed_by_bot &&
            reqRow.claimed_by_bot !== bot.bot_id
          ) {
            throw new Error('lead_request is claimed by another bot')
          }
          await supabase
            .from('lead_requests')
            .update({
              state: 'claimed',
              claimed_by_bot: bot.bot_id,
              updated_at: new Date().toISOString(),
            })
            .eq('request_id', leadRequestId)
        }
        await notifyPendingProposal(proposalUid)
        result = { proposal_uid: proposalUid, status: 'pending_approval' }
        break
      }
      case 'claim_lead_request': {
        const { data, error } = await supabase.rpc('claim_lead_request', {
          p_bot_id: bot.bot_id,
          p_limit: Number(args.limit) || 1,
          p_lease_seconds: 3600,
        })
        if (error) throw new Error(error.message)
        result = { items: data ?? [] }
        break
      }
      case 'submit_approval_verdict': {
        const { recordApprovalDecision } = await import('@/lib/l3/slack-approval')
        const verdict = String(args.verdict).toLowerCase() === 'approve' ? 'approve' : 'reject'
        result = await recordApprovalDecision({
          proposalUid: String(args.proposal_uid),
          verdict,
          reason: String(args.reason ?? `bot:${bot.bot_id}`),
          slackUser: `bot:${bot.bot_id}`,
        })
        break
      }
      case 'report_blocked': {
        const { data: blocked, error } = await supabase
          .from('l3_review_queue')
          .update({
            state: 'blocked',
            dirty_reason: String(args.reason ?? 'blocked'),
            updated_at: new Date().toISOString(),
          })
          .eq('item_id', args.item_id)
          .eq('leased_by', bot.bot_id)
          .select('item_id')
        if (error) throw new Error(error.message)
        result = { ok: (blocked?.length ?? 0) > 0, updated: blocked?.length ?? 0 }
        break
      }
      case 'release_review_batch': {
        const { data: released, error } = await supabase
          .from('l3_review_queue')
          .update({
            state: 'pending',
            lease_id: null,
            leased_by: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('lease_id', args.lease_id)
          .eq('leased_by', bot.bot_id)
          .select('item_id')
        if (error) throw new Error(error.message)
        result = { ok: (released?.length ?? 0) > 0, released: released?.length ?? 0 }
        break
      }
      default:
        throw new Error(`unknown tool ${name}`)
    }
    await audit(bot, name, true, { args: Object.keys(args) })
    return result
  } catch (err) {
    await audit(bot, name, false, { error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}
