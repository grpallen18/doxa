# Environment Variables Setup

## .env.local File Format

Your `.env.local` file should be in the **root directory** of the project and have this exact format:

```env
NEXT_PUBLIC_SUPABASE_URL=https://gjxihyaovyfwajjyoyoz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_PeUkfHqn8NNHbfiCQmRC3Q_dv8AUr5S
```

## Important Notes

1. **No spaces around the `=` sign**
   - ✅ Correct: `NEXT_PUBLIC_SUPABASE_URL=https://...`
   - ❌ Wrong: `NEXT_PUBLIC_SUPABASE_URL = https://...`

2. **No quotes needed** (unless the value has spaces)
   - ✅ Correct: `NEXT_PUBLIC_SUPABASE_URL=https://...`
   - ❌ Wrong: `NEXT_PUBLIC_SUPABASE_URL="https://..."`

3. **No trailing spaces** at the end of lines

4. **File must be named exactly**: `.env.local` (starts with a dot)

5. **Must be in project root** (same directory as `package.json`)

## Verification

After creating/editing `.env.local`:

1. **Restart the dev server** (this is critical!)
   - Stop: `Ctrl+C` in the terminal running `npm run dev`
   - Start: `npm run dev`

2. **Check the terminal output** - you should see:
   ```
   ✓ Ready in X seconds
   ```

3. **Test an endpoint**:
   ```
   http://localhost:3000/api/viewpoints
   ```

## Troubleshooting

### Still getting "Missing environment variables" error?

1. **Verify file location**: `.env.local` should be next to `package.json`
2. **Check file name**: Must be exactly `.env.local` (not `env.local` or `.env`)
3. **Restart server**: Environment variables are only loaded when the server starts
4. **Check for typos**: Variable names must be exactly:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. **No BOM/encoding issues**: Save as UTF-8 without BOM

### Edge Functions (Supabase secrets)

Edge Functions use secrets set in **Supabase** (not in `.env.local`): Dashboard → Edge Functions → Secrets, or `supabase secrets set KEY=value`.

**Which keys each step needs:** [doxa-agents/docs/generated/secrets.md](doxa-agents/docs/generated/secrets.md) (auto-generated from handler code).

**Cron Vault secrets:** `project_url`, `service_role_key` (Database → Vault).

**Pipeline docs:** [doxa-agents/AGENTS.md](doxa-agents/AGENTS.md) · **Deploy:** [doxa-agents/docs/generated/deploy.md](doxa-agents/docs/generated/deploy.md) · **Crons:** [doxa-agents/docs/generated/cron-jobs.md](doxa-agents/docs/generated/cron-jobs.md)

After changing handlers or cron SQL, run `npm run agents:refresh`.

### Scrape workflow (Cloudflare Worker secrets)

The Worker used for article scraping expects these **secrets**. For Git-connected deploys, add them in **Build → Variables and secrets** and use `bash deploy-with-secrets.sh` as the deploy command. For manual deploys, use **Workers & Pages → your worker → Settings → Variables and Secrets**:

- **`SCRAPE_SECRET`** — Same value as Supabase; protects `/scrape` and authenticates callbacks to receive_scraped_content.
- **`SUPABASE_RECEIVE_URL`** — Full URL of the receive_scraped_content Edge Function (e.g. `https://<project_ref>.supabase.co/functions/v1/receive_scraped_content`).
- **`CLOUDFLARE_ACCOUNT_ID`** — For Browser Rendering fallback (optional).
- **`CLOUDFLARE_API_TOKEN`** — For Browser Rendering fallback; token must have "Browser Rendering - Edit" permission.

See [workers/README.md](workers/README.md) for details.

### Check if variables are loaded:

Add this temporarily to any API route to debug:
```typescript
console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing')
```
