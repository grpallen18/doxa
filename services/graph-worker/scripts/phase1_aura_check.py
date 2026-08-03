"""Phase 1 Aura provenance spot-check for a Document/story uid."""
from __future__ import annotations

import os
import sys

from neo4j import GraphDatabase

STORY = sys.argv[1] if len(sys.argv) > 1 else "1ab913f7-3913-4fd3-be18-6ceafc9f4dd4"


def main() -> None:
    driver = GraphDatabase.driver(
        os.environ["NEO4J_URI"],
        auth=(os.environ["NEO4J_USERNAME"], os.environ["NEO4J_PASSWORD"]),
    )
    db = os.environ.get("NEO4J_DATABASE", "neo4j")
    with driver.session(database=db) as session:
        props = session.run(
            """
            MATCH (u:Utterance {documentUid: $storyId})-[:EXPRESSES]->(p:Proposition)
            OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision {decisionType: 'proposition_link'})-[:ABOUT]->(p)
            OPTIONAL MATCH (u)-[:GROUNDED_IN]->(seg:Segment)
            OPTIONAL MATCH (p)-[:VARIANT_OF]->(parent:Proposition)
            RETURN count(DISTINCT u) AS utterances_with_props,
                   count(DISTINCT p) AS propositions,
                   count(DISTINCT dec) AS prop_decisions,
                   sum(CASE WHEN dec IS NULL THEN 1 ELSE 0 END) AS missing_prop_dec,
                   count(DISTINCT CASE WHEN seg IS NULL THEN u END) AS missing_grounding,
                   count(DISTINCT parent) AS variants
            """,
            storyId=STORY,
        ).single()
        ents = session.run(
            """
            MATCH (u:Utterance {documentUid: $storyId})-[:MENTIONS]->(e:Entity)
            OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision {decisionType: 'entity_link'})-[:ABOUT]->(e)
            RETURN count(DISTINCT e) AS entities,
                   count(DISTINCT dec) AS entity_decisions,
                   sum(CASE WHEN dec IS NULL THEN 1 ELSE 0 END) AS missing_ent_dec
            """,
            storyId=STORY,
        ).single()
        sample = list(
            session.run(
                """
                MATCH (u:Utterance {documentUid: $storyId})-[:EXPRESSES]->(p:Proposition)
                OPTIONAL MATCH (u)-[:DECIDED_BY]->(dec:Decision {decisionType: 'proposition_link'})-[:ABOUT]->(p)
                RETURN u.uid AS uid, p.uid AS prop_uid, left(p.text, 80) AS text,
                       dec.status AS status, dec.confidence AS confidence
                LIMIT 5
                """,
                storyId=STORY,
            )
        )
    driver.close()
    print("story", STORY)
    print("props", dict(props))
    print("ents", dict(ents))
    for row in sample:
        print("sample", dict(row))


if __name__ == "__main__":
    main()
