-- 010_drop_dependents_and_refactor_topics.sql
-- Drop tables that reference topics or viewpoints; refactor topics to target shape (slug, title, summary, status, metadata).
-- No data retention; reseed after this and 011.

-- 1. Drop tables in FK-safe order (dependents first)
DROP TABLE IF EXISTS validations CASCADE;
DROP TABLE IF EXISTS viewpoint_votes CASCADE;
DROP TABLE IF EXISTS topic_viewpoints CASCADE;
DROP TABLE IF EXISTS topic_relationships CASCADE;
DROP TABLE IF EXISTS claim_sources CASCADE;
DROP TABLE IF EXISTS sources CASCADE;
DROP TABLE IF EXISTS claims CASCADE;
DROP TABLE IF EXISTS viewpoints CASCADE;

-- 2. Refactor topics table to target shape (topic_id, slug, title, summary, status, metadata, created_at, updated_at)
-- 2a. Rename primary key column
ALTER TABLE topics RENAME COLUMN id TO topic_id;

-- 2b. Add new columns (with defaults for existing rows)
ALTER TABLE topics ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Drop RLS policy that references status so we can alter its type
DROP POLICY IF EXISTS "Public read access to topics" ON topics;

-- 2c. Convert status from enum to text (for existing rows: cast current status)
ALTER TABLE topics ALTER COLUMN status TYPE TEXT USING status::text;

-- Recreate policy: allow public read for published + legacy status values
CREATE POLICY "Public read access to topics" ON topics
  FOR SELECT USING (status IN ('under_review', 'stable', 'published'));

-- 2d. Drop index on question before dropping column
DROP INDEX IF EXISTS idx_topics_question;

-- 2e. Drop old columns
ALTER TABLE topics DROP COLUMN IF EXISTS question;
ALTER TABLE topics DROP COLUMN IF EXISTS version;
ALTER TABLE topics DROP COLUMN IF EXISTS parent_version_id;
ALTER TABLE topics DROP COLUMN IF EXISTS shared_facts;
ALTER TABLE topics DROP COLUMN IF EXISTS core_facts;
ALTER TABLE topics DROP COLUMN IF EXISTS coverage_summary;
ALTER TABLE topics DROP COLUMN IF EXISTS missing_viewpoints;
ALTER TABLE topics DROP COLUMN IF EXISTS created_by;

-- 2f. Set NOT NULL and defaults where needed (slug, title required by target; backfill for existing rows)
UPDATE topics SET slug = topic_id::text WHERE slug IS NULL;
UPDATE topics SET title = 'Untitled' WHERE title IS NULL;
UPDATE topics SET metadata = '{}'::jsonb WHERE metadata IS NULL;
ALTER TABLE topics ALTER COLUMN slug SET NOT NULL;
ALTER TABLE topics ALTER COLUMN title SET NOT NULL;
ALTER TABLE topics ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_slug ON topics(slug);

-- 3. Drop enums no longer used
DROP TYPE IF EXISTS topic_status CASCADE;
DROP TYPE IF EXISTS relationship_type CASCADE;
DROP TYPE IF EXISTS source_type CASCADE;
