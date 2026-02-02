-- 009_rename_nodes_to_topics_and_perspectives_to_viewpoints.sql
-- Rename tables, enum, columns, indexes, and triggers to topic/viewpoint terminology.
-- Do not modify migrations 001–008 or seed.sql; they run first; this migration performs the renames.

-- 1. Rename enum
ALTER TYPE node_status RENAME TO topic_status;

-- 2. Rename core tables
ALTER TABLE nodes RENAME TO topics;
ALTER TABLE perspectives RENAME TO viewpoints;

-- 3. Rename junction/child tables
ALTER TABLE node_perspectives RENAME TO topic_viewpoints;
ALTER TABLE node_relationships RENAME TO topic_relationships;
ALTER TABLE perspective_votes RENAME TO viewpoint_votes;

-- 4. Rename columns: topics (missing_perspectives from 002)
ALTER TABLE topics RENAME COLUMN missing_perspectives TO missing_viewpoints;

-- 4. Rename columns: topic_viewpoints
ALTER TABLE topic_viewpoints RENAME COLUMN node_id TO topic_id;
ALTER TABLE topic_viewpoints RENAME COLUMN perspective_id TO viewpoint_id;

-- 4. Rename columns: topic_relationships
ALTER TABLE topic_relationships RENAME COLUMN source_node_id TO source_topic_id;
ALTER TABLE topic_relationships RENAME COLUMN target_node_id TO target_topic_id;

-- 4. Rename columns: sources
ALTER TABLE sources RENAME COLUMN node_id TO topic_id;
ALTER TABLE sources RENAME COLUMN perspective_id TO viewpoint_id;

-- 4. Rename columns: validations
ALTER TABLE validations RENAME COLUMN node_id TO topic_id;
ALTER TABLE validations RENAME COLUMN node_version TO topic_version;
ALTER TABLE validations RENAME COLUMN perspective_id TO viewpoint_id;

-- 4. Rename columns: viewpoint_votes
ALTER TABLE viewpoint_votes RENAME COLUMN node_id TO topic_id;
ALTER TABLE viewpoint_votes RENAME COLUMN node_version TO topic_version;
ALTER TABLE viewpoint_votes RENAME COLUMN perspective_id TO viewpoint_id;

-- 4. Rename columns: claims
ALTER TABLE claims RENAME COLUMN node_id TO topic_id;

-- 4b. Rename foreign key constraints (so PostgREST embed hints work)
ALTER TABLE topic_viewpoints RENAME CONSTRAINT node_perspectives_node_id_fkey TO topic_viewpoints_topic_id_fkey;
ALTER TABLE topic_viewpoints RENAME CONSTRAINT node_perspectives_perspective_id_fkey TO topic_viewpoints_viewpoint_id_fkey;
ALTER TABLE topic_relationships RENAME CONSTRAINT node_relationships_source_node_id_fkey TO topic_relationships_source_topic_id_fkey;
ALTER TABLE topic_relationships RENAME CONSTRAINT node_relationships_target_node_id_fkey TO topic_relationships_target_topic_id_fkey;
ALTER TABLE sources RENAME CONSTRAINT sources_node_id_fkey TO sources_topic_id_fkey;
ALTER TABLE sources RENAME CONSTRAINT sources_perspective_id_fkey TO sources_viewpoint_id_fkey;
ALTER TABLE validations RENAME CONSTRAINT validations_node_id_fkey TO validations_topic_id_fkey;
ALTER TABLE validations RENAME CONSTRAINT validations_perspective_id_fkey TO validations_viewpoint_id_fkey;
ALTER TABLE viewpoint_votes RENAME CONSTRAINT perspective_votes_node_id_fkey TO viewpoint_votes_topic_id_fkey;
ALTER TABLE viewpoint_votes RENAME CONSTRAINT perspective_votes_perspective_id_fkey TO viewpoint_votes_viewpoint_id_fkey;
ALTER TABLE claims RENAME CONSTRAINT claims_node_id_fkey TO claims_topic_id_fkey;

-- 5. Drop old indexes (names reference old table/column names)
DROP INDEX IF EXISTS idx_nodes_status;
DROP INDEX IF EXISTS idx_nodes_question;
DROP INDEX IF EXISTS idx_node_perspectives_node_id;
DROP INDEX IF EXISTS idx_node_perspectives_perspective_id;
DROP INDEX IF EXISTS idx_node_relationships_source;
DROP INDEX IF EXISTS idx_node_relationships_target;
DROP INDEX IF EXISTS idx_sources_node_id;
DROP INDEX IF EXISTS idx_validations_node_id;
DROP INDEX IF EXISTS idx_validations_perspective_id;

-- 6. Create new indexes
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_topics_question ON topics USING gin(to_tsvector('english', question));
CREATE INDEX IF NOT EXISTS idx_topic_viewpoints_topic_id ON topic_viewpoints(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_viewpoints_viewpoint_id ON topic_viewpoints(viewpoint_id);
CREATE INDEX IF NOT EXISTS idx_topic_relationships_source ON topic_relationships(source_topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_relationships_target ON topic_relationships(target_topic_id);
CREATE INDEX IF NOT EXISTS idx_sources_topic_id ON sources(topic_id);
CREATE INDEX IF NOT EXISTS idx_validations_topic_id ON validations(topic_id);
CREATE INDEX IF NOT EXISTS idx_validations_viewpoint_id ON validations(viewpoint_id);

-- 7. Rename triggers (drop old, create new)
DROP TRIGGER IF EXISTS update_nodes_updated_at ON topics;
CREATE TRIGGER update_topics_updated_at BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_node_perspectives_updated_at ON topic_viewpoints;
CREATE TRIGGER update_topic_viewpoints_updated_at BEFORE UPDATE ON topic_viewpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Rename RLS policies for clarity (drop old names, create new)
DROP POLICY IF EXISTS "Public read access to nodes" ON topics;
CREATE POLICY "Public read access to topics" ON topics
  FOR SELECT USING (status IN ('under_review', 'stable'));

DROP POLICY IF EXISTS "Public read access to perspectives" ON viewpoints;
CREATE POLICY "Public read access to viewpoints" ON viewpoints
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read access to node_perspectives" ON topic_viewpoints;
CREATE POLICY "Public read access to topic_viewpoints" ON topic_viewpoints
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read access to node_relationships" ON topic_relationships;
CREATE POLICY "Public read access to topic_relationships" ON topic_relationships
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read access to perspective_votes" ON viewpoint_votes;
CREATE POLICY "Public read access to viewpoint_votes" ON viewpoint_votes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can upsert their own perspective_votes" ON viewpoint_votes;
CREATE POLICY "Users can upsert their own viewpoint_votes" ON viewpoint_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own perspective_votes" ON viewpoint_votes;
CREATE POLICY "Users can update their own viewpoint_votes" ON viewpoint_votes
  FOR UPDATE USING (auth.uid() = user_id);
