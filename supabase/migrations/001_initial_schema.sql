-- Doxa Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension (pgcrypto provides gen_random_uuid which is more reliable in Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE node_status AS ENUM ('draft', 'under_review', 'stable');
CREATE TYPE relationship_type AS ENUM ('parent_child', 'depends_on', 'contextual', 'related_event', 'shared_actor');
CREATE TYPE source_type AS ENUM ('article', 'primary_document', 'video', 'podcast');

-- Users table (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  survey_responses JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Perspectives table
CREATE TABLE IF NOT EXISTS perspectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nodes table
CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  status node_status DEFAULT 'draft',
  version INTEGER DEFAULT 1,
  parent_version_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  shared_facts JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Node perspectives (many-to-many with additional fields)
CREATE TABLE IF NOT EXISTS node_perspectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  perspective_id UUID NOT NULL REFERENCES perspectives(id) ON DELETE CASCADE,
  core_claim TEXT NOT NULL,
  key_arguments JSONB DEFAULT '[]'::jsonb,
  emphasis TEXT,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(node_id, perspective_id, version)
);

-- Node relationships (graph edges)
CREATE TABLE IF NOT EXISTS node_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  relationship_type relationship_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (source_node_id != target_node_id),
  UNIQUE(source_node_id, target_node_id, relationship_type)
);

-- Sources table
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  perspective_id UUID REFERENCES perspectives(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  source_type source_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Validations table
CREATE TABLE IF NOT EXISTS validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  node_version INTEGER NOT NULL,
  perspective_id UUID NOT NULL REFERENCES perspectives(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_represented BOOLEAN NOT NULL,
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(node_id, node_version, perspective_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_question ON nodes USING gin(to_tsvector('english', question));
CREATE INDEX IF NOT EXISTS idx_node_perspectives_node_id ON node_perspectives(node_id);
CREATE INDEX IF NOT EXISTS idx_node_perspectives_perspective_id ON node_perspectives(perspective_id);
CREATE INDEX IF NOT EXISTS idx_node_relationships_source ON node_relationships(source_node_id);
CREATE INDEX IF NOT EXISTS idx_node_relationships_target ON node_relationships(target_node_id);
CREATE INDEX IF NOT EXISTS idx_sources_node_id ON sources(node_id);
CREATE INDEX IF NOT EXISTS idx_validations_node_id ON validations(node_id);
CREATE INDEX IF NOT EXISTS idx_validations_perspective_id ON validations(perspective_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_nodes_updated_at BEFORE UPDATE ON nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_node_perspectives_updated_at BEFORE UPDATE ON node_perspectives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE perspectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_perspectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE validations ENABLE ROW LEVEL SECURITY;

-- Policies: Allow public read access to published content
CREATE POLICY "Public read access to nodes" ON nodes
  FOR SELECT USING (status IN ('under_review', 'stable'));

CREATE POLICY "Public read access to perspectives" ON perspectives
  FOR SELECT USING (true);

CREATE POLICY "Public read access to node_perspectives" ON node_perspectives
  FOR SELECT USING (true);

CREATE POLICY "Public read access to node_relationships" ON node_relationships
  FOR SELECT USING (true);

CREATE POLICY "Public read access to sources" ON sources
  FOR SELECT USING (true);

-- Policies: Allow authenticated users to create validations
CREATE POLICY "Users can create validations" ON validations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own validations" ON validations
  FOR SELECT USING (auth.uid() = user_id OR true); -- Allow viewing all for stats

-- Policies: Allow users to read their own user record
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);
