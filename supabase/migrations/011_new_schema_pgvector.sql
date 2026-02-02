-- 011_new_schema_pgvector.sql
-- Create target schema from README data dictionary: pipeline_runs, sources, stories, topic_stories,
-- claims, story_claims, story_evidence, links, archetypes, theses, viewpoints, narratives; pgvector for embeddings.

CREATE EXTENSION IF NOT EXISTS vector;

-- pipeline_runs (no FK from other new tables; referenced by run_id)
CREATE TABLE pipeline_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  model_provider TEXT,
  model_name TEXT,
  parameters JSONB,
  counts JSONB,
  error TEXT
);

-- sources (publisher metadata)
CREATE TABLE sources (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  domain TEXT,
  bias_tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- stories (articles; FK sources)
CREATE TABLE stories (
  story_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_snippet TEXT,
  content_full TEXT,
  language TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- topic_stories (scope: which stories belong to which topic)
CREATE TABLE topic_stories (
  topic_id UUID NOT NULL REFERENCES topics(topic_id) ON DELETE CASCADE,
  story_id UUID NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  assignment_method TEXT NOT NULL,
  assignment_confidence NUMERIC,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (topic_id, story_id)
);

-- claims (canonical; no FK to topics)
CREATE TABLE claims (
  claim_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_text TEXT NOT NULL,
  canonical_hash TEXT NOT NULL UNIQUE,
  subject TEXT,
  predicate TEXT,
  object TEXT,
  timeframe TEXT,
  location TEXT,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- story_claims (raw claims per story)
CREATE TABLE story_claims (
  story_claim_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  polarity TEXT NOT NULL,
  extraction_confidence NUMERIC NOT NULL,
  span_start INT,
  span_end INT,
  claim_id UUID REFERENCES claims(claim_id) ON DELETE SET NULL,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- story_evidence (quotes, stats, citations)
CREATE TABLE story_evidence (
  evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  attribution TEXT,
  source_ref TEXT,
  span_start INT,
  span_end INT,
  extraction_confidence NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- story_claim_evidence_links (Phase 1: story-local)
CREATE TABLE story_claim_evidence_links (
  story_claim_id UUID NOT NULL REFERENCES story_claims(story_claim_id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES story_evidence(evidence_id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  rationale TEXT,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (story_claim_id, evidence_id)
);

-- claim_evidence_links (Phase 2: canonical)
CREATE TABLE claim_evidence_links (
  claim_id UUID NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES story_evidence(evidence_id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  rationale TEXT,
  link_origin TEXT NOT NULL,
  origin_story_id UUID REFERENCES stories(story_id) ON DELETE SET NULL,
  origin_story_claim_id UUID REFERENCES story_claims(story_claim_id) ON DELETE SET NULL,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (claim_id, evidence_id, relation_type, origin_story_id)
);

-- archetypes (global lenses)
CREATE TABLE archetypes (
  archetype_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- claim_archetypes (many-to-many claims <-> archetypes)
CREATE TABLE claim_archetypes (
  claim_id UUID NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  archetype_id UUID NOT NULL REFERENCES archetypes(archetype_id) ON DELETE CASCADE,
  confidence NUMERIC NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (claim_id, archetype_id)
);

-- theses (claim clusters per topic + archetype)
CREATE TABLE theses (
  thesis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(topic_id) ON DELETE CASCADE,
  archetype_id UUID NOT NULL REFERENCES archetypes(archetype_id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  summary TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- thesis_claims (bridge: claims in theses)
CREATE TABLE thesis_claims (
  thesis_id UUID NOT NULL REFERENCES theses(thesis_id) ON DELETE CASCADE,
  claim_id UUID NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  membership_score NUMERIC,
  rank INT,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (thesis_id, claim_id)
);

-- viewpoints (archetype-scoped positions per topic)
CREATE TABLE viewpoints (
  viewpoint_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(topic_id) ON DELETE CASCADE,
  archetype_id UUID NOT NULL REFERENCES archetypes(archetype_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- viewpoint_theses (bridge: theses in viewpoints)
CREATE TABLE viewpoint_theses (
  viewpoint_id UUID NOT NULL REFERENCES viewpoints(viewpoint_id) ON DELETE CASCADE,
  thesis_id UUID NOT NULL REFERENCES theses(thesis_id) ON DELETE CASCADE,
  weight NUMERIC,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (viewpoint_id, thesis_id)
);

-- narratives (cross-topic)
CREATE TABLE narratives (
  narrative_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- narrative_viewpoint_links (bridge: viewpoints in narratives)
CREATE TABLE narrative_viewpoint_links (
  narrative_id UUID NOT NULL REFERENCES narratives(narrative_id) ON DELETE CASCADE,
  viewpoint_id UUID NOT NULL REFERENCES viewpoints(viewpoint_id) ON DELETE CASCADE,
  weight NUMERIC,
  run_id UUID REFERENCES pipeline_runs(run_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (narrative_id, viewpoint_id)
);

-- Indexes (FK columns and published_at per README)
CREATE INDEX IF NOT EXISTS idx_stories_source_id ON stories(source_id);
CREATE INDEX IF NOT EXISTS idx_stories_published_at ON stories(published_at);
CREATE INDEX IF NOT EXISTS idx_topic_stories_topic_id ON topic_stories(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_stories_story_id ON topic_stories(story_id);
CREATE INDEX IF NOT EXISTS idx_story_claims_story_id ON story_claims(story_id);
CREATE INDEX IF NOT EXISTS idx_story_claims_claim_id ON story_claims(claim_id);
CREATE INDEX IF NOT EXISTS idx_story_evidence_story_id ON story_evidence(story_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_links_claim_id ON claim_evidence_links(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_links_evidence_id ON claim_evidence_links(evidence_id);
CREATE INDEX IF NOT EXISTS idx_claim_archetypes_claim_id ON claim_archetypes(claim_id);
CREATE INDEX IF NOT EXISTS idx_theses_topic_id ON theses(topic_id);
CREATE INDEX IF NOT EXISTS idx_theses_archetype_id ON theses(archetype_id);
CREATE INDEX IF NOT EXISTS idx_thesis_claims_thesis_id ON thesis_claims(thesis_id);
CREATE INDEX IF NOT EXISTS idx_viewpoints_topic_id ON viewpoints(topic_id);
CREATE INDEX IF NOT EXISTS idx_viewpoints_archetype_id ON viewpoints(archetype_id);

-- updated_at trigger for claims (reuse function from 001 if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_claims_updated_at BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: enable on all new tables; public read where appropriate
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_claim_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE archetypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_archetypes ENABLE ROW LEVEL SECURITY;
ALTER TABLE theses ENABLE ROW LEVEL SECURITY;
ALTER TABLE thesis_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE viewpoint_theses ENABLE ROW LEVEL SECURITY;
ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_viewpoint_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read pipeline_runs" ON pipeline_runs FOR SELECT USING (true);
CREATE POLICY "Public read sources" ON sources FOR SELECT USING (true);
CREATE POLICY "Public read stories" ON stories FOR SELECT USING (true);
CREATE POLICY "Public read topic_stories" ON topic_stories FOR SELECT USING (true);
CREATE POLICY "Public read claims" ON claims FOR SELECT USING (true);
CREATE POLICY "Public read story_claims" ON story_claims FOR SELECT USING (true);
CREATE POLICY "Public read story_evidence" ON story_evidence FOR SELECT USING (true);
CREATE POLICY "Public read story_claim_evidence_links" ON story_claim_evidence_links FOR SELECT USING (true);
CREATE POLICY "Public read claim_evidence_links" ON claim_evidence_links FOR SELECT USING (true);
CREATE POLICY "Public read archetypes" ON archetypes FOR SELECT USING (true);
CREATE POLICY "Public read claim_archetypes" ON claim_archetypes FOR SELECT USING (true);
CREATE POLICY "Public read theses" ON theses FOR SELECT USING (true);
CREATE POLICY "Public read thesis_claims" ON thesis_claims FOR SELECT USING (true);
CREATE POLICY "Public read viewpoints" ON viewpoints FOR SELECT USING (true);
CREATE POLICY "Public read viewpoint_theses" ON viewpoint_theses FOR SELECT USING (true);
CREATE POLICY "Public read narratives" ON narratives FOR SELECT USING (true);
CREATE POLICY "Public read narrative_viewpoint_links" ON narrative_viewpoint_links FOR SELECT USING (true);
