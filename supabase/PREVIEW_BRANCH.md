# Preview branch (claims-only experiment)

| | Main | Preview |
|--|------|---------|
| Project | `gjxihyaovyfwajjyoyoz` | `iyuwxdjauhlaeejstlde` (confirm URL resolves in dashboard) |
| Git branch | `main` | `experiment/chunk-extraction-rebuild` |

## Isolated extract tuning (preview only)

Goal: run **extract only**, read claims on chunks, tweak the prompt, reset, repeat. Skip validate/merge for now.

**Where output lives:** `story_chunks.extraction_json` (not `story_claims` — that table is filled at **merge**, later).

### Loop

1. `npm run env:branch` and restart `npm run dev`  
   If auth logs `fetch failed` / `ENOTFOUND` for `iyuwxdjauhlaeejstlde.supabase.co`, the preview project is gone or paused — use `npm run env:main` or fix the project ref in `.env.local.branch`.
2. Admin → open story `15208581-91ae-4454-92bf-d7a16d1a6313`
3. Run **Chunk story bodies** (once, if no chunks yet)
4. Run **Extract primary claims** only
5. Expand the extract step in the checklist to review claims per chunk
6. Edit prompt: `doxa-agents/lib/extraction-qa/openai-qa.ts` → `EXTRACT_CLAIMS_SYSTEM_PROMPT`, then redeploy:
   ```powershell
   supabase functions deploy extract_story_claims
   ```
7. **Clear extraction** in admin (resets chunk `extraction_json` + any `story_claims` for that story)
8. Go to step 4 again

Seed CNN fixture (full article from `docs/sample_extraction.json`, ~3400 chars):

```powershell
npm run seed:preview-cnn
```

If you need **longer text than the repo fixture** (e.g. exact copy from main prod), save `story_bodies.content_clean` from main as `docs/fixtures/cnn-oman-article.txt` and we can point the seed script at that file — or paste the plain text in chat.

After seed: run **Chunk story bodies** in admin (or `chunk_story_bodies`), then extract.

```powershell
npm run preview:extract-claims
```

## Extract timing out (504)?

Supabase Edge kills idle functions at **~150s**. Extract calls OpenAI once per chunk; the default was `gpt-5.4-nano-2026-03-17`, which can exceed that limit.

**Fix (preview secrets):** [Edge secrets](https://supabase.com/dashboard/project/iyuwxdjauhlaeejstlde/functions/secrets)

```text
OPENAI_MODEL_EXTRACT=gpt-4o-mini
```

Confirm **`OPENAI_API_KEY`** is set on the **preview branch** (not only main). Redeploy after handler changes:

```powershell
supabase functions deploy extract_story_claims --project-ref iyuwxdjauhlaeejstlde
```

**Diagnostics** (run one at a time; avoid parallel extract invokes):

```powershell
npm run env:branch
npm run debug:preview-extract ping    # OpenAI reachability + model (~5s)
npm run debug:preview-extract skip      # DB/chunk path without LLM (~2s)
npm run debug:preview-extract extract  # full extract, 1 chunk
```

During prompt tuning, review **`story_chunks.extraction_json`** only — merge/validate can wait.

Do **not** use `npm run e2e:preview-claims` while tuning — that runs the full pipeline.

---

## Full pipeline test (later)

When extract quality looks good, run validate → merge manually from admin, or:

```powershell
npm run e2e:preview-claims
```

---

## Deploy / migrations (when you change code)

CLI linked to preview:

```powershell
supabase link --project-ref iyuwxdjauhlaeejstlde
supabase db push
supabase functions deploy extract_story_claims
supabase functions deploy validate_chunk_claims
supabase functions deploy merge_story_claims
```

Do **not** push experimental migrations to main until the experiment merges.

## After the experiment works

1. Merge Git branch → `main`
2. `supabase link --project-ref gjxihyaovyfwajjyoyoz && supabase db push`
3. Deploy the three functions above to main
4. `npm run env:main`

Test story: `15208581-91ae-4454-92bf-d7a16d1a6313`

## Admin access on preview (one-time)

Preview is a fresh project — new signups get role `user`. Elevate in SQL:

```sql
update public.users set role = 'admin'
where id = (select id from auth.users where email = 'your@email.com');
```

Enable the auth hook so JWT includes `user_role` (copy from main if needed):

**Auth → Hooks → Customize Access Token** → function `public.custom_access_token_hook`

Then **sign out and sign back in** so the new role is in your session.
