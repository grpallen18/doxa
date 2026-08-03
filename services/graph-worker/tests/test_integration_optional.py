"""Optional Aura integration test — skips unless RUN_GRAPH_INTEGRATION=1."""

from __future__ import annotations

import os
import unittest
import uuid
from pathlib import Path

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "sample_article.txt"


@unittest.skipUnless(
    os.getenv("RUN_GRAPH_INTEGRATION") == "1",
    "Set RUN_GRAPH_INTEGRATION=1 plus Neo4j/OpenAI env to run",
)
class Phase0IntegrationTests(unittest.TestCase):
    def test_fixture_writes_utterance_paths(self) -> None:
        from dotenv import load_dotenv
        from neo4j import GraphDatabase

        from app.config import Settings
        from app.pipeline import process_story
        from app.write_graph import delete_document_subgraph

        load_dotenv()
        settings = Settings.from_env()
        document_uid = f"fixture-{uuid.uuid4().hex[:12]}"
        story = {
            "story_id": document_uid,
            "title": "Fixture border bill debate",
            "published_at": "2024-03-12T00:00:00Z",
            "url": "https://example.test/fixture",
            "source_id": "fixture-publication",
            "source_name": "Fixture News",
            "content_clean": FIXTURE.read_text(encoding="utf-8").strip(),
        }
        result = process_story(settings, story)
        self.assertGreater(result.get("utterance_count", 0), 0)

        driver = GraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_username, settings.neo4j_password),
        )
        try:
            with driver.session(database=settings.neo4j_database) as session:
                row = session.run(
                    """
                    MATCH (u:Utterance {documentUid: $uid})-[:GROUNDED_IN]->(seg:Segment)
                          <-[:CONTAINS]-(d:Document {uid: $uid})
                    OPTIONAL MATCH (d)-[:PUBLISHED_BY]->(p:Publication)
                    RETURN count(u) AS n, count(p) AS pubs
                    """,
                    uid=document_uid,
                ).single()
                self.assertIsNotNone(row)
                self.assertGreater(row["n"], 0)
                self.assertGreater(row["pubs"], 0)
        finally:
            delete_document_subgraph(driver, settings.neo4j_database, document_uid)
            driver.close()


if __name__ == "__main__":
    unittest.main()
