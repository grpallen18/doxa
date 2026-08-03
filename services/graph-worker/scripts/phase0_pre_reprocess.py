"""Capture pre-reprocess counts, note publication element id."""
from __future__ import annotations

import os

from neo4j import GraphDatabase

STORY = "1ab913f7-3913-4fd3-be18-6ceafc9f4dd4"


def main() -> None:
    driver = GraphDatabase.driver(
        os.environ["NEO4J_URI"],
        auth=(os.environ["NEO4J_USERNAME"], os.environ["NEO4J_PASSWORD"]),
    )
    db = os.environ.get("NEO4J_DATABASE", "neo4j")
    with driver.session(database=db) as session:
        session.run(
            "CREATE CONSTRAINT document_uid IF NOT EXISTS "
            "FOR (x:Document) REQUIRE x.uid IS UNIQUE"
        )
        pubs = session.run("MATCH (p:Publication) RETURN count(p) AS c").single()["c"]
        utts = session.run(
            "MATCH (u:Utterance {documentUid: $story}) RETURN count(u) AS c",
            story=STORY,
        ).single()["c"]
        pub = session.run(
            """
            MATCH (d:Document {uid: $story})-[:PUBLISHED_BY]->(p:Publication)
            RETURN p.uid AS uid, elementId(p) AS eid, p.name AS name
            """,
            story=STORY,
        ).single()
    driver.close()
    print("publications_total", pubs)
    print("utterances", utts)
    print("publication", dict(pub) if pub else None)


if __name__ == "__main__":
    main()
