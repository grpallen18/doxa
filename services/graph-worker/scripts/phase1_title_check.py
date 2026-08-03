"""Spot-check person/office title split for a story."""
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
        ents = list(
            session.run(
                """
                MATCH (u:Utterance {documentUid: $storyId})-[m:MENTIONS]->(e:Entity)
                RETURN e.name AS name, e.kindHint AS kind, e.normalizedName AS norm,
                       m.surfaceForm AS surface, m.title AS title
                ORDER BY e.kindHint, e.name
                """,
                storyId=STORY,
            )
        )
        refs = list(
            session.run(
                """
                MATCH (p:Entity)-[r:REFERRED_AS {documentUid: $storyId}]->(o:Entity)
                RETURN p.name AS person, o.name AS office, r.title AS title
                """,
                storyId=STORY,
            )
        )
    driver.close()
    print("story", STORY)
    for row in ents:
        print("mention", dict(row))
    for row in refs:
        print("referred_as", dict(row))


if __name__ == "__main__":
    main()
