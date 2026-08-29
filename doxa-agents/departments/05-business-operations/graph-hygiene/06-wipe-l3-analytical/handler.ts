// Supabase Edge Function: wipe_l3_analytical.
// Deletes L3 debate layer (Questions, ANSWERS, Viewpoints, Controversies, Disputes)
// and L3 Decision types. Keeps L0–L2 atoms.
// Body: { confirm: "WIPE_L3", dry_run?: boolean, truncate_sql?: boolean }
// Env: NEO4J_*, optional SUPABASE_* when truncate_sql is true.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json,
  requireInternalAuth,
} from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";

const CONFIRM = "WIPE_L3";

const L3_DECISION_TYPES = [
  "proposition_pair_candidate",
  "proposition_relationship",
  "controversy_title",
  "controversy_qualify",
  "dispute",
  "question_mint",
  "question_match",
  "question_answer",
  "question_link",
  "l3_membership",
  "l3_viewpoint",
  "l3_audit",
  "l3_mint",
  "l3_merge",
  "l3_retype",
];

async function countLabel(label: string): Promise<number> {
  const rows = await runCypher<{ n: number }>(
    `MATCH (n:${label}) RETURN count(n) AS n`
  );
  return Number(rows[0]?.n) || 0;
}

async function countRel(type: string): Promise<number> {
  const rows = await runCypher<{ n: number }>(
    `MATCH ()-[r:${type}]->() RETURN count(r) AS n`
  );
  return Number(rows[0]?.n) || 0;
}

async function snapshot() {
  return {
    propositions: await countLabel("Proposition"),
    utterances: await countLabel("Utterance"),
    arguments: await countLabel("Argument"),
    questions: await countLabel("Question"),
    viewpoints: await countLabel("Viewpoint"),
    controversies: await countLabel("Controversy"),
    disputes: await countLabel("Dispute"),
    issues: await countLabel("Issue"),
    answers: await countRel("ANSWERS"),
    candidate_for: await countRel("CANDIDATE_FOR"),
    relates_to: await countRel("RELATES_TO"),
    in_issue: await countRel("IN_ISSUE"),
    subject_of: await countRel("SUBJECT_OF"),
  };
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authError = await requireInternalAuth(req);
  if (authError) return authError;
  if (!getNeo4jEnv()) return json({ error: "Neo4j not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.json().catch(() => ({}));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
  } catch { /* defaults */ }

  if (body.confirm !== CONFIRM) {
    return json(
      {
        ok: false,
        error: `Refusing wipe without { "confirm": "${CONFIRM}" }`,
      },
      400
    );
  }

  const dryRun = Boolean(body.dry_run ?? false);
  const truncateSql = Boolean(body.truncate_sql ?? false);
  const before = await snapshot();

  if (dryRun) {
    return json({ ok: true, dry_run: true, before, truncate_sql: truncateSql });
  }

  await runCypher(`
    MATCH (n)
    WHERE n:Viewpoint OR n:Controversy OR n:Dispute OR n:Question
       OR (n:Issue AND (n.uid STARTS WITH 'arena:' OR n.uid STARTS WITH 'issue:'))
    DETACH DELETE n
  `);

  await runCypher(`MATCH ()-[r:ANSWERS]->() DELETE r`);
  await runCypher(`MATCH ()-[r:CANDIDATE_FOR]->() DELETE r`);
  await runCypher(`MATCH ()-[r:RELATES_TO]->() DELETE r`);
  await runCypher(`MATCH ()-[r:IN_ISSUE]->() DELETE r`);
  await runCypher(`MATCH ()-[r:SUBJECT_OF]->() DELETE r`);
  // Only Question↔Question VARIANT_OF is L3 (question merges); those are already
  // gone via the DETACH DELETE of Question nodes above. Do NOT delete all
  // VARIANT_OF — Proposition↔Proposition VARIANT_OF is L0–L2 claim identity
  // (graph-worker proposition ER) and must be preserved.
  await runCypher(`MATCH (:Question)-[r:VARIANT_OF]-() DELETE r`);

  await runCypher(
    `
    MATCH (d:Decision)
    WHERE d.decisionType IN $types
    DETACH DELETE d
    `,
    { types: L3_DECISION_TYPES }
  );

  await runCypher(`
    MATCH (a:Assessment)
    WHERE a.targetKind IN ['controversy', 'viewpoint', 'question']
    DETACH DELETE a
  `);

  let sqlTruncated: string[] = [];
  if (truncateSql) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (SUPABASE_URL && SERVICE_ROLE) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false },
      });
      const tables = [
        "graph_controversy_subjects",
        "graph_evidence_excerpts",
        "graph_topic_links",
        "graph_controversy_evidence",
        "graph_viewpoints",
        "graph_controversies",
        "graph_questions",
        "l3_proposal_ops",
        "l3_proposals",
        "l3_review_queue",
        "l3_runs",
        "l3_gold_negatives",
      ];
      const noUid = new Set([
        "graph_controversy_subjects",
        "graph_evidence_excerpts",
        "graph_topic_links",
        "graph_controversy_evidence",
        "l3_proposal_ops",
        "l3_proposals",
        "l3_review_queue",
        "l3_runs",
        "l3_gold_negatives",
      ]);
      for (const table of tables) {
        const q = noUid.has(table)
          ? supabase.from(table).delete().gte("created_at", "1970-01-01T00:00:00Z")
          : supabase.from(table).delete().neq("uid", "__never__");
        const { error } = await q;
        if (!error) sqlTruncated.push(table);
      }
    }
  }

  const after = await snapshot();

  const atomsOk =
    after.propositions === before.propositions &&
    after.utterances === before.utterances &&
    after.arguments === before.arguments;

  return json(
    {
      ok: atomsOk,
      dry_run: false,
      atoms_preserved: atomsOk,
      before,
      after,
      sql_truncated: sqlTruncated,
      error: atomsOk
        ? undefined
        : "L0–L2 atom counts changed after wipe; inspect before/after",
    },
    atomsOk ? 200 : 500
  );
};
