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

- **ingest-newsapi:** `NEWSAPI_API_KEY`
- **relevance_gate:** `OPENAI_API_KEY`; optional `OPENAI_MODEL` (default `gpt-4o-mini`)

See [supabase/README.md](supabase/README.md) for deploy and cron.

### Check if variables are loaded:

Add this temporarily to any API route to debug:
```typescript
console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('KEY:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'Missing')
```
