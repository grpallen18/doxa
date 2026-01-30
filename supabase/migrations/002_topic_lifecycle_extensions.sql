-- 002_topic_lifecycle_extensions.sql
-- Extend schema to support minimal topic lifecycle (claims, coverage) and future scoring.

-- Claims table: atomic factual assertions associated with a node (topic).
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  claim_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Join table linking claims to sources that support or contradict them.
CREATE TABLE IF NOT EXISTS claim_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Optional narrative and framing fields on nodes.
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS core_facts TEXT,
  ADD COLUMN IF NOT EXISTS coverage_summary TEXT,
  ADD COLUMN IF NOT EXISTS missing_perspectives TEXT;

-- Enable RLS on new tables and allow public read access.
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access to claims" ON claims
  FOR SELECT USING (true);

CREATE POLICY "Public read access to claim_sources" ON claim_sources
  FOR SELECT USING (true);

