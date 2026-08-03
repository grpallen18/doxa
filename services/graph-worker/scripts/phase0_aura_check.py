"""One-off Phase 0 Aura provenance check."""
from __future__ import annotations

import os
import sys

from neo4j import GraphDatabase

STORY = "1ab913f7-3913-4fd3-be18-6ceafc9f4dd4"


def main() -> int:
    uri = os.environ["NEO4J_URI"]
    user = os.environ["NEO4J_USERNAME"]
    pwd = os.environ["NEO4J_PASSWORD"]
    db = os.environ.get("NEO4J_DATABASE", "neo4j")
    driver = GraphDatabase.driver(uri, auth=(user, pwd))
    cypher = """
    MATCH (u:Utterance)-[gi:GROUNDED_IN]->(seg:Segment)<-[:CONTAINS]-(d:Document {uid: $story})
    OPTIONAL MATCH (u)-[:ASSERTED_BY]->(a:Agent)
    OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(p:Publication)
    OPTIONAL MATCH (u)-[:PRODUCED_BY]->(r:ExtractionRun)
    OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision)
    RETURN d.uid AS doc, p.name AS pub, a.name AS agent, u.attributionMode AS mode,
           u.speechAct AS act, u.uid AS uid, u.text AS text, seg.ord AS ord,
           gi.charStart AS cs, gi.charEnd AS ce, r.uid AS run, dec.decisionType AS dtype
    ORDER BY seg.ord, gi.charStart
    """
    with driver.session(database=db) as session:
        rows = list(session.run(cypher, story=STORY))
    print("utterances", len(rows))
    modes = {r["mode"] for r in rows}
    missing_run = sum(1 for r in rows if not r["run"])
    missing_seg = sum(1 for r in rows if r["ord"] is None)
    missing_agent = sum(
        1 for r in rows if r["mode"] != "journalist_voice" and not r["agent"]
    )
    print("modes", sorted(m for m in modes if m))
    print(
        "missing_run",
        missing_run,
        "missing_seg",
        missing_seg,
        "missing_agent_non_j",
        missing_agent,
    )
    print("pub", rows[0]["pub"] if rows else None)
    for r in rows[:8]:
        text = (r["text"] or "")[:70]
        print(
            f"ord={r['ord']} mode={r['mode']} agent={r['agent']!r} "
            f"span={r['cs']}-{r['ce']} dtype={r['dtype']} text={text!r}"
        )
    driver.close()
    return 0 if rows and missing_run == 0 and missing_seg == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
