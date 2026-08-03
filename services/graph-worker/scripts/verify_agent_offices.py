"""Verify Agent -> Office REFERRED_AS for a story."""
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
        for r in session.run(
            """
            MATCH (a:Agent)-[r:REFERRED_AS {documentUid: $sid}]->(o:Entity)
            WHERE a.uid STARTS WITH $sid
            RETURN a.name AS agent, o.name AS office, r.title AS title
            ORDER BY a.name
            """,
            sid=STORY,
        ):
            print("agent->office", dict(r))
        for r in session.run(
            """
            MATCH (u:Utterance {documentUid: $sid})-[ab:ASSERTED_BY]->(a:Agent)
            RETURN DISTINCT a.name AS agent, ab.surfaceForm AS surface
            ORDER BY a.name
            """,
            sid=STORY,
        ):
            print("asserted", dict(r))
    driver.close()


if __name__ == "__main__":
    main()
