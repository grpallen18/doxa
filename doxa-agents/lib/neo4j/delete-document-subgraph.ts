/**
 * Document subgraph delete matching services/graph-worker/app/write_graph.py
 * delete_document_subgraph. Shared Controversies / Viewpoints / Disputes / Questions are kept.
 */

import { runCypher } from "../neo4j/session.ts";

export async function deleteDocumentSubgraph(documentUid: string): Promise<void> {
  const collected = await runCypher<{
    prop_uids: string[] | null;
    ent_uids: string[] | null;
  }>(
    `
    MATCH (u:Utterance {documentUid: $document_uid})
    OPTIONAL MATCH (u)-[:EXPRESSES]->(prop:Proposition)
    OPTIONAL MATCH (u)-[:MENTIONS]->(ent:Entity)
    OPTIONAL MATCH (ent)-[ra:REFERRED_AS {documentUid: $document_uid}]->(office:Entity)
    OPTIONAL MATCH (u)-[:ASSERTED_BY]->(agent:Agent)
    OPTIONAL MATCH (agent)-[ara:REFERRED_AS {documentUid: $document_uid}]->(aoffice:Entity)
    RETURN collect(DISTINCT prop.uid) AS prop_uids,
           collect(DISTINCT ent.uid) + collect(DISTINCT office.uid)
             + collect(DISTINCT aoffice.uid) AS ent_uids
    `,
    { document_uid: documentUid }
  );
  const propUids = (collected[0]?.prop_uids ?? []).filter(Boolean);
  const entUids = [...new Set((collected[0]?.ent_uids ?? []).filter(Boolean))];

  await runCypher(
    `
    MATCH (dec:Decision)
    WHERE dec.uid STARTS WITH $adec_prefix
    DETACH DELETE dec
    `,
    { adec_prefix: `${documentUid}:adec:` }
  );
  await runCypher(
    `
    MATCH (arg:Argument {documentUid: $document_uid})
    OPTIONAL MATCH (arg)-[:DECIDED_BY]->(adec:Decision)
    DETACH DELETE adec, arg
    `,
    { document_uid: documentUid }
  );
  await runCypher(
    `
    MATCH (dec:Decision)
    WHERE dec.uid STARTS WITH $pdec_prefix
    DETACH DELETE dec
    `,
    { pdec_prefix: `${documentUid}:pdec:` }
  );
  await runCypher(
    `
    MATCH (dec:Decision)
    WHERE dec.uid STARTS WITH $edec_prefix
    DETACH DELETE dec
    `,
    { edec_prefix: `${documentUid}:edec:` }
  );
  await runCypher(
    `
    MATCH ()-[r:REFERRED_AS {documentUid: $document_uid}]->()
    DELETE r
    `,
    { document_uid: documentUid }
  );
  await runCypher(
    `
    MATCH (d:Document {uid: $document_uid})
    OPTIONAL MATCH (d)-[:CONTAINS]->(seg:Segment)
    OPTIONAL MATCH (d)-[:HAS_ASSET]->(asset:MediaAsset)
    OPTIONAL MATCH (u:Utterance {documentUid: $document_uid})
    OPTIONAL MATCH (u)-[:PRODUCED_BY]->(run:ExtractionRun)
    OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision)
    OPTIONAL MATCH (agent:Agent)
    WHERE agent.uid STARTS WITH $agent_prefix
    WITH d,
         collect(DISTINCT seg) AS segs,
         collect(DISTINCT asset) AS assets,
         collect(DISTINCT u) AS utts,
         collect(DISTINCT run) AS runs,
         collect(DISTINCT dec) AS decs,
         collect(DISTINCT agent) AS agents
    FOREACH (n IN [x IN segs + assets + utts + runs + decs + agents WHERE x IS NOT NULL] |
      DETACH DELETE n)
    DETACH DELETE d
    `,
    { document_uid: documentUid, agent_prefix: `${documentUid}:agent:` }
  );
  if (propUids.length) {
    await runCypher(
      `
      UNWIND $prop_uids AS puid
      MATCH (p:Proposition {uid: puid})
      WHERE NOT EXISTS { MATCH (:Utterance)-[:EXPRESSES]->(p) }
      OPTIONAL MATCH (p)<-[:DECIDED_BY]-(d:Decision)
      DETACH DELETE d, p
      `,
      { prop_uids: propUids }
    );
  }
  if (entUids.length) {
    await runCypher(
      `
      UNWIND $ent_uids AS euid
      MATCH (e:Entity {uid: euid})
      WHERE NOT EXISTS { MATCH (:Utterance)-[:MENTIONS]->(e) }
        AND NOT EXISTS { MATCH (e)-[:REFERRED_AS]-() }
        AND NOT EXISTS { MATCH ()-[:REFERRED_AS]->(e) }
      DETACH DELETE e
      `,
      { ent_uids: entUids }
    );
  }
  await runCypher(
    `
    MATCH (s:Story {story_id: $document_uid})
    OPTIONAL MATCH (s)-[*0..3]-(n)
    WHERE n:Chunk OR n:Assertion OR n:Event
       OR (n:Entity AND n.story_id = $document_uid)
       OR (n:Actor AND n.story_id = $document_uid)
    DETACH DELETE s, n
    `,
    { document_uid: documentUid }
  );
}
