# Supabase CLI Setup Guide

## Step 1: Login to Supabase CLI

Run this command in your terminal (it will open a browser for authentication):

```bash
supabase login
```

This will:
1. Open your browser
2. Ask you to authorize the CLI
3. Return to your terminal once complete

## Step 2: Link to Your Project

After logging in, link to your existing project:

```bash
supabase link --project-ref gjxihyaovyfwajjyoyoz
```

You'll be prompted to select a database password. If you don't remember it, you can:
- Reset it in the Supabase dashboard under Settings > Database
- Or use the existing password if you have it

## Step 3: Push Migrations

Once linked, push the migration to your database:

```bash
supabase db push
```

This will:
- Apply the migration from `supabase/migrations/001_initial_schema.sql`
- Create all tables, indexes, and RLS policies

## Step 4: Seed the Database (Optional)

You can seed the database using the CLI:

```bash
supabase db reset
```

**OR** manually run the seed SQL:

```bash
# Copy the seed.sql content and run it via:
supabase db execute --file supabase/seed.sql
```

Or use the Supabase dashboard SQL Editor to run `supabase/seed.sql`.

## Alternative: Using Access Token

If you prefer not to use interactive login, you can:

1. Go to https://supabase.com/dashboard/account/tokens
2. Generate a new access token
3. Set it as an environment variable:

```bash
# Windows PowerShell
$env:SUPABASE_ACCESS_TOKEN="your_token_here"

# Then link
supabase link --project-ref gjxihyaovyfwajjyoyoz
```

## Verify Setup

After pushing migrations, verify everything worked:

```bash
node supabase/verify-setup.js
```

Or check the Supabase dashboard Table Editor to see your tables.

## Troubleshooting

### "Database password required"
- You'll need your database password to link
- Find it in Supabase dashboard: Settings > Database > Database password
- Or reset it if needed

### "Migration failed"
- Check the error message in the terminal
- Common issues: syntax errors, missing extensions, permission issues
- You can also check the Supabase dashboard logs

### "Already linked"
- If you've linked before, you can skip the link step
- Just run `supabase db push` directly
