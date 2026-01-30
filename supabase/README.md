# Supabase Setup Guide

## Initial Setup

1. **Run the migration:**
   - Go to your Supabase project dashboard
   - Navigate to SQL Editor
   - Copy and paste the contents of `migrations/001_initial_schema.sql`
   - Click "Run" to execute

2. **Seed the database:**
   - In the SQL Editor, copy and paste the contents of `seed.sql`
   - Click "Run" to populate with sample data

3. **Topic lifecycle and long content (optional but recommended):**
   - Run in order: `002_topic_lifecycle_extensions.sql`, `003_perspective_votes.sql`, `004_seed_core_facts.sql`, `006_shared_facts_expand_paragraphs.sql` (same way: SQL Editor → paste file → Run).
   - Without these, topic pages will show short or empty main body and shared-facts sections; with them, topics show Wikipedia-style paragraphs.

## What Gets Created

### Tables
- `users` - User profiles (extends Supabase Auth)
- `perspectives` - Perspective definitions (Conservative, Progressive, Libertarian, etc.)
- `nodes` - Core Doxa nodes (political questions)
- `node_perspectives` - Many-to-many relationship with perspective content
- `node_relationships` - Graph edges between nodes
- `sources` - Source citations
- `validations` - User validation feedback

### Seed Data
- 3 perspectives: Conservative, Progressive, Libertarian
- 5 interconnected nodes on immigration topics
- Sample relationships between nodes
- Sample sources

## Row Level Security (RLS)

The schema includes RLS policies that:
- Allow public read access to published nodes (under_review, stable)
- Allow authenticated users to create validations
- Allow users to manage their own profiles

You may need to adjust these policies based on your specific needs.

## Next Steps

After running the migration and seed:
1. Verify tables exist in the Table Editor
2. Check that seed data appears correctly
3. Test API access from your Next.js app
