# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Doxa is a Next.js 14 (App Router) political knowledge-graph app backed by a hosted Supabase instance (PostgreSQL + Auth). See `README.md` for full product description and project structure.

### Running the app

- **Dev server:** `npm run dev` (port 3000). All routes are auth-gated; unauthenticated requests redirect to `/login`.
- **Lint:** `npm run lint`
- **Build:** `npm run build` — currently has a pre-existing TypeScript type error in `app/api/atlas/maps/[id]/route.ts` (`linked_to_viewpoint` vs `linked_to_thesis` mismatch). The dev server still works fine.

### Environment variables

Three secrets are required in `.env.local` (project root):

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | For admin ops | Service role key for admin API routes |

The cloud agent VM injects these as environment variables. The `.env.local` file is created from them at setup time — it is gitignored and must be regenerated each session.

### ESLint config

The repo ships without an `.eslintrc.json`. One is created during setup with `next/core-web-vitals` + `@typescript-eslint` plugin so that `npm run lint` works non-interactively and recognizes the `@typescript-eslint/no-explicit-any` rule referenced in existing code.

### Creating test users

The hosted Supabase has email rate limits and domain validation on sign-up. To create a test user for manual testing, use the admin API:

```bash
curl -X POST "${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"devtest@doxa-cloud.com","password":"TestPassword123!","email_confirm":true}'
```

### Key caveats

- The `.env.local` file must be recreated each session from injected secrets. The dev server must be restarted after creating/editing it.
- The Cloudflare Worker (`workers/`) and Supabase Edge Functions (`supabase/functions/`) are optional for local UI development. They require separate secrets and deploy processes (see `ENV_SETUP.md`).
- API routes redirect to `/login` for unauthenticated requests due to `middleware.ts`. To test API endpoints directly, you need a valid session cookie.
