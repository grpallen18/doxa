# Librarian

Keeps the agent catalog and generated docs in sync with handlers and cron SQL. Does not modify application logic or migrations.

Cursor skill: [.cursor/skills/librarian/SKILL.md](../../.cursor/skills/librarian/SKILL.md)

Local: `npm run agents:refresh` (sync manifest, generated docs, purge routine, pipeline catalog, validate). Never hand-edit `manifest.yaml` or `docs/generated/*`.

## CI (GitHub Actions)

[`.github/workflows/agents-docs.yml`](../../.github/workflows/agents-docs.yml) is the catalog gate. It runs on **pull_request** and **push to `main`** when these paths change:

- `doxa-agents/**`
- `supabase/functions/**`
- `scripts/agents-*.ts` (includes `scripts/agents-lib.ts`)
- `app/api/**`

Job steps (Node 20, `npm ci`):

1. **`npm run build`** — Next.js TypeScript compile. Added so handler/catalog type errors fail CI even when `--check` scripts would otherwise pass.
2. `npm run agents:sync:check`
3. `npm run agents:docs:check`
4. `npm run agents:validate`

**Pitfalls**

- Editing **only** `.github/workflows/agents-docs.yml` does **not** trigger this workflow (the YAML is outside the path filters). Touch a listed path or run the job from the Actions UI.
- Docs under `docs/**` or root `README.md` do **not** trigger catalog CI. Pipeline README / handler / stub edits do.
