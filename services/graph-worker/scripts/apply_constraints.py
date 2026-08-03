"""Apply Phase 0 Neo4j constraints from init_constraints.cypher."""
from __future__ import annotations

import os
from pathlib import Path

from neo4j import GraphDatabase

CONSTRAINTS = Path(__file__).resolve().parents[1] / "neo4j" / "init_constraints.cypher"


def main() -> None:
    text = CONSTRAINTS.read_text(encoding="utf-8")
    cleaned: list[str] = []
    for chunk in text.split(";"):
        lines = [
            ln
            for ln in chunk.splitlines()
            if ln.strip() and not ln.strip().startswith("#")
        ]
        if not lines:
            continue
        stmt = "\n".join(lines).strip()
        if stmt.upper().startswith("CREATE "):
            cleaned.append(stmt)

    driver = GraphDatabase.driver(
        os.environ["NEO4J_URI"],
        auth=(os.environ["NEO4J_USERNAME"], os.environ["NEO4J_PASSWORD"]),
    )
    db = os.environ.get("NEO4J_DATABASE", "neo4j")
    with driver.session(database=db) as session:
        for stmt in cleaned:
            print("RUN:", stmt.split("\n")[0][:90])
            session.run(stmt)
    driver.close()
    print("constraints_applied", len(cleaned))


if __name__ == "__main__":
    main()
