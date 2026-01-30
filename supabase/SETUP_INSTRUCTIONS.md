# Supabase Database Setup Instructions

## Method 1: Using Supabase Dashboard (Recommended)

### Step 1: Run the Migration

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/gjxihyaovyfwajjyoyoz
2. Click on **"SQL Editor"** in the left sidebar
3. Click **"New query"** button
4. Open the file `supabase/migrations/001_initial_schema.sql` in your code editor
5. Copy the **entire contents** of the file
6. Paste it into the SQL Editor in Supabase
7. Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)

You should see a success message if everything worked correctly.

### Step 2: Verify Tables Were Created

1. In the Supabase dashboard, click on **"Table Editor"** in the left sidebar
2. You should see the following tables:
   - `users`
   - `perspectives`
   - `nodes`
   - `node_perspectives`
   - `node_relationships`
   - `sources`
   - `validations`

### Step 3: Seed the Database

1. Go back to **"SQL Editor"**
2. Click **"New query"**
3. Open the file `supabase/seed.sql` in your code editor
4. Copy the **entire contents** of the file
5. Paste it into the SQL Editor
6. Click **"Run"**

### Step 4: Verify Seed Data

1. Go to **"Table Editor"**
2. Click on the `perspectives` table - you should see 3 rows (Conservative, Progressive, Libertarian)
3. Click on the `nodes` table - you should see 5 nodes
4. Click on `node_perspectives` - you should see multiple perspective entries for each node

## Method 2: Using Supabase CLI (Advanced)

If you have Supabase CLI installed:

```bash
# Link to your project
supabase link --project-ref gjxihyaovyfwajjyoyoz

# Run migrations
supabase db push
```

## Troubleshooting

### Error: "relation already exists"
- Some tables might already exist. The migration uses `IF NOT EXISTS` so this should be safe, but if you see errors, you may need to drop existing tables first.

### Error: "permission denied"
- Make sure you're using the SQL Editor with proper permissions. You may need to use the service role key for some operations.

### Error: "extension uuid-ossp does not exist"
- This extension should be available by default in Supabase. If not, contact Supabase support.

## Next Steps

After successful setup:
1. Run the verification script: `node supabase/verify-setup.js`
2. Or manually check tables in the Table Editor
3. Proceed with building the API endpoints
