"""Inspect Agent + Entity names for a story."""
from __future__ import annotations

import os
import sys

from neo4j import GraphDatabase

from app.entity_er import parse_speaker_name

STORY = sys.argv[1] if len(sys.argv) > 1 else "1ab913f7-3913-4fd3-be18-6ceafc9f4dd4"


def main() -> None:
    driver = GraphDatabase.driver(
        os.environ["NEO4J_URI"],
        auth=(os.environ["NEO4J_USERNAME"], os.environ["NEO4J_PASSWORD"]),
    )
    db = os.environ.get("NEO4J_DATABASE", "neo4j")
    with driver.session(database=db) as session:
        doc = session.run(
            "MATCH (d:Document {uid: $sid}) RETURN d.extractorVersion AS v, d.schemaVersion AS s",
            sid=STORY,
        ).single()
        print("document", dict(doc) if doc else None)
        for r in session.run(
            """
            MATCH (u:Utterance {documentUid: $sid})-[:ASSERTED_BY]->(a:Agent)
            RETURN DISTINCT a.name AS name
            """,
            sid=STORY,
        ):
            name = r["name"]
            parsed = parse_speaker_name(name or "")
            print("agent", repr(name), "->", parsed.name, parsed.kind_hint, parsed.office_normalized)
    driver.close()


if __name__ == "__main__":
    main()
