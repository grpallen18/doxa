-- 003_perspective_votes.sql
-- Viewpoint scoring via upvote/downvote and free-text reasoning.

CREATE TABLE IF NOT EXISTS perspective_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  node_version INTEGER NOT NULL,
  perspective_id UUID NOT NULL REFERENCES perspectives(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  vote_value SMALLINT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(node_id, node_version, perspective_id, user_id)
);

ALTER TABLE perspective_votes ENABLE ROW LEVEL SECURITY;

-- Allow public read access to aggregate/view votes.
CREATE POLICY "Public read access to perspective_votes" ON perspective_votes
  FOR SELECT USING (true);

-- Allow authenticated users to create or update their own votes.
CREATE POLICY "Users can upsert their own perspective_votes" ON perspective_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own perspective_votes" ON perspective_votes
  FOR UPDATE USING (auth.uid() = user_id);

