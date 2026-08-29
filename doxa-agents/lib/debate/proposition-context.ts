/**
 * Proposition + source document context for mint review and Slack approval cards.
 */

import type { QueryFn } from "./proposal-validator.ts";

export type PropositionSourceContext = {
  prop_uid: string;
  text: string;
  utterance_uid: string | null;
  segment_text: string | null;
  speaker: string | null;
  publication: string | null;
  published_at: string | null;
  document_uid: string | null;
  document_title: string | null;
  document_url: string | null;
};

export type MintReviewSourceLink = {
  url: string;
  title: string | null;
  publication: string | null;
};

const PROPOSITION_CONTEXT_CYPHER = `
UNWIND $uids AS uid
MATCH (p:Proposition {uid: uid})
OPTIONAL MATCH (p)<-[:EXPRESSES]-(u:Utterance)
OPTIONAL MATCH (u)-[:ASSERTED_BY]->(ag:Agent)
OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
OPTIONAL MATCH (d:Document {uid: u.documentUid})
OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(pub:Publication)
WITH uid AS propUid, p, u, ag, seg, d, pub
ORDER BY u.uid
WITH propUid, p, head(collect({
  utteranceUid: u.uid,
  segmentText: coalesce(seg.text, u.text),
  speaker: coalesce(ag.name, ag.label),
  documentUid: u.documentUid,
  documentTitle: d.title,
  documentUrl: d.url,
  publication: pub.name,
  publishedAt: toString(d.publishedAt)
})) AS bag
RETURN propUid,
       coalesce(p.text, p.normalizedText, '') AS text,
       bag.utteranceUid AS utteranceUid,
       bag.segmentText AS segmentText,
       bag.speaker AS speaker,
       bag.documentUid AS documentUid,
       bag.documentTitle AS documentTitle,
       bag.documentUrl AS documentUrl,
       bag.publication AS publication,
       bag.publishedAt AS publishedAt
`;

function rowToContext(row: Record<string, unknown>): PropositionSourceContext {
  return {
    prop_uid: String(row.propUid ?? ""),
    text: String(row.text ?? ""),
    utterance_uid: row.utteranceUid != null ? String(row.utteranceUid) : null,
    segment_text: row.segmentText != null ? String(row.segmentText) : null,
    speaker: row.speaker != null ? String(row.speaker) : null,
    publication: row.publication != null ? String(row.publication) : null,
    published_at: row.publishedAt != null ? String(row.publishedAt) : null,
    document_uid: row.documentUid != null ? String(row.documentUid) : null,
    document_title: row.documentTitle != null ? String(row.documentTitle) : null,
    document_url: row.documentUrl != null ? String(row.documentUrl) : null,
  };
}

export async function fetchPropositionContexts(
  query: QueryFn,
  propUids: string[]
): Promise<PropositionSourceContext[]> {
  const uids = [...new Set(propUids.map((u) => u.trim()).filter(Boolean))];
  if (!uids.length) return [];
  const rows = await query<Record<string, unknown>>(PROPOSITION_CONTEXT_CYPHER, { uids });
  return rows.map(rowToContext).filter((r) => r.prop_uid);
}

export function uniqueSourceLinks(
  contexts: PropositionSourceContext[]
): MintReviewSourceLink[] {
  const seen = new Set<string>();
  const links: MintReviewSourceLink[] = [];
  for (const ctx of contexts) {
    const url = ctx.document_url?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push({
      url,
      title: ctx.document_title,
      publication: ctx.publication,
    });
  }
  return links;
}

export function isVagueMintQuestion(text: string): boolean {
  const q = text.trim();
  if (/^Is .+['']s reporting on .+ false\?$/i.test(q)) return true;
  if (/^Is .+ reporting on .+ false\?$/i.test(q)) return true;
  if (/^Is .+['']s .+ reporting false\?$/i.test(q)) return true;
  if (/\breporting on .+ (is false|was false)\b/i.test(q) && !/\b(that|whether|accused|alleged|claimed|reported|said|wrote|published)\b/i.test(q)) {
    return true;
  }
  return false;
}

export function isGenericAnswerStatement(text: string, question: string): boolean {
  const s = text.trim();
  const q = question.trim().replace(/[?]+$/g, "");
  if (!s || !q) return false;
  const genericPro = `Yes: ${q}.`;
  const genericCon = `No: it is not the case that ${q}.`;
  return s === genericPro || s === genericCon;
}

export const MIN_MINT_ANSWER_STATEMENT_LEN = 24;
