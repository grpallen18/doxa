// Supabase Edge Function: wipe_l3_analytical.
// Deletes Viewpoint / Controversy / Dispute / Arena Issue extrapolations.
// Keeps L0–L2 atoms (Document, Utterance, Proposition, Argument, Entity, …).
// Body: { confirm: "WIPE_L3", dry_run?: boolean }
// Env: NEO4J_*

import { corsHeaders, json } from "../../../../lib/topology/invoke-step.ts";
import { runCypher, getNeo4jEnv } from "../../../../lib/neo4j/session.ts";

const CONFIRM = "WIPE_L3";

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
    viewpoints: await countLabel("Viewpoint"),
    controversies: await countLabel("Controversy"),
    disputes: await countLabel("Dispute"),
    issues: await countLabel("Issue"),
    relates_to: await countRel("RELATES_TO"),
    in_issue: await countRel("IN_ISSUE"),
    subject_of: await countRel("SUBJECT_OF"),
  };
}

export const handler = async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
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
  const before = await snapshot();

  if (dryRun) {
    return json({ ok: true, dry_run: true, before });
  }

  await runCypher(`
    MATCH (n)
    WHERE n:Viewpoint OR n:Controversy OR n:Dispute
       OR (n:Issue AND (n.uid STARTS WITH 'arena:' OR n.uid STARTS WITH 'issue:'))
    DETACH DELETE n
  `);

  await runCypher(`MATCH ()-[r:RELATES_TO]->() DELETE r`);
  await runCypher(`MATCH ()-[r:IN_ISSUE]->() DELETE r`);
  await runCypher(`MATCH ()-[r:SUBJECT_OF]->() DELETE r`);

  await runCypher(`
    MATCH (d:Decision)
    WHERE d.decisionType IN [
      'proposition_pair_candidate',
      'controversy_title',
      'dispute'
    ]
    DETACH DELETE d
  `);

  await runCypher(`
    MATCH (a:Assessment)
    WHERE a.targetKind IN ['controversy', 'viewpoint']
    DETACH DELETE a
  `);

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
      error: atomsOk
        ? undefined
        : "L0–L2 atom counts changed after wipe; inspect before/after",
    },
    atomsOk ? 200 : 500
  );
};
