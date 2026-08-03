"""Verify GROUNDED_IN spans against Supabase content_clean via REST."""
from __future__ import annotations

import json
import os
import sys
import urllib.request

from neo4j import GraphDatabase

STORY = "1ab913f7-3913-4fd3-be18-6ceafc9f4dd4"


def main() -> int:
    url = (
        os.environ["SUPABASE_URL"].rstrip("/")
        + f"/rest/v1/story_bodies?story_id=eq.{STORY}&select=content_clean"
    )
    req = urllib.request.Request(
        url,
        headers={
            "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        },
    )
    body = json.load(urllib.request.urlopen(req))[0]["content_clean"]

    driver = GraphDatabase.driver(
        os.environ["NEO4J_URI"],
        auth=(os.environ["NEO4J_USERNAME"], os.environ["NEO4J_PASSWORD"]),
    )
    db = os.environ.get("NEO4J_DATABASE", "neo4j")
    cypher = """
    MATCH (u:Utterance {documentUid: $story})-[gi:GROUNDED_IN]->(:Segment)
    RETURN u.text AS text, gi.charStart AS cs, gi.charEnd AS ce
    """
    mismatches = 0
    with driver.session(database=db) as session:
        rows = list(session.run(cypher, story=STORY))
    for r in rows:
        cs, ce = int(r["cs"]), int(r["ce"])
        slice_ = body[cs:ce]
        utext = (r["text"] or "").strip()
        ok = (
            slice_ == utext
            or (utext and utext[:30] in slice_)
            or (slice_ and slice_[:30] in utext)
        )
        if not ok:
            mismatches += 1
            print("MISMATCH", cs, ce, repr(slice_[:60]), repr(utext[:60]))
        else:
            print("OK", cs, ce)
    print("body_len", len(body), "checked", len(rows), "mismatches", mismatches)
    driver.close()
    return 0 if mismatches == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
