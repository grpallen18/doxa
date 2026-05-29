# Librarian

Keeps the agent catalog and generated docs in sync with handlers and cron SQL. Does not modify application logic or migrations.

Cursor skill: [.cursor/skills/librarian/SKILL.md](../../.cursor/skills/librarian/SKILL.md)

Runs `npm run agents:refresh` (sync manifest, generated docs, purge routine, validate).
