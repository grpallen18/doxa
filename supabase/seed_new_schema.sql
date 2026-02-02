-- Seed data for Doxa target schema (run after 010 and 011)
-- Populates: pipeline_runs, sources, stories, topics (upsert), topic_stories, archetypes,
-- claims, story_claims, theses, thesis_claims, viewpoints, viewpoint_theses, narratives, narrative_viewpoint_links

-- 1. Pipeline run (placeholder)
INSERT INTO pipeline_runs (run_id, pipeline_name, status, started_at, ended_at)
VALUES ('a0000000-0000-0000-0000-000000000001', 'seed_manual', 'success', NOW(), NOW())
ON CONFLICT (run_id) DO NOTHING;

-- 2. Sources (publishers)
INSERT INTO sources (source_id, name, domain, bias_tags, metadata) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'The New York Times', 'nytimes.com', ARRAY['center-left'], '{}'::jsonb),
  ('b0000000-0000-0000-0000-000000000002', 'The Wall Street Journal', 'wsj.com', ARRAY['center-right'], '{}'::jsonb),
  ('b0000000-0000-0000-0000-000000000003', 'Reuters', 'reuters.com', ARRAY['center'], '{}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- 3. Topics (upsert: insert or update slug, title, summary, status, metadata)
INSERT INTO topics (topic_id, slug, title, summary, status, metadata, created_at, updated_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'minneapolis-ice-protests', 'Minneapolis ICE protests', 'Demonstrations in the Minneapolis–Saint Paul area in 2018 in response to ICE enforcement operations.', 'published', '{}'::jsonb, NOW(), NOW()),
  ('10000000-0000-0000-0000-000000000002', 'election-integrity-voting-laws', 'Election integrity and voting laws', 'Legal and administrative framework for how elections are conducted and how citizens register and cast ballots.', 'published', '{}'::jsonb, NOW(), NOW()),
  ('10000000-0000-0000-0000-000000000003', 'redistricting-gerrymandering', 'Redistricting and gerrymandering', 'Process of drawing electoral districts and the practice of drawing lines to advantage a party or group.', 'published', '{}'::jsonb, NOW(), NOW()),
  ('10000000-0000-0000-0000-000000000004', 'tariff-policy', 'Tariff policy', 'Taxes or duties on imported goods; debate over protectionism versus free trade.', 'published', '{}'::jsonb, NOW(), NOW()),
  ('10000000-0000-0000-0000-000000000005', 'twitter-files', 'Twitter Files', 'Releases of internal Twitter documents and communications beginning in late 2022.', 'published', '{}'::jsonb, NOW(), NOW())
ON CONFLICT (topic_id) DO UPDATE SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- 4. Stories (sample articles)
INSERT INTO stories (story_id, source_id, url, title, author, published_at, fetched_at, content_snippet, language, metadata) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'https://example.com/nyt-ice-1', 'Community Protests ICE Operations in Minneapolis', 'Staff', NOW() - INTERVAL '30 days', NOW(), 'Residents gathered to protest federal immigration enforcement.', 'en', '{}'::jsonb),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'https://example.com/wsj-voting-1', 'Voter ID Laws and Access: A Debate', 'Staff', NOW() - INTERVAL '20 days', NOW(), 'States weigh voter identification requirements.', 'en', '{}'::jsonb),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 'https://example.com/reuters-1', 'Redistricting Commission Approves New Maps', 'Staff', NOW() - INTERVAL '10 days', NOW(), 'Independent commission completes congressional map review.', 'en', '{}'::jsonb)
ON CONFLICT (url) DO NOTHING;

-- 5. Topic-stories (assign stories to topics)
INSERT INTO topic_stories (topic_id, story_id, assignment_method, assignment_confidence, run_id, created_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'manual', 1.0, 'a0000000-0000-0000-0000-000000000001', NOW()),
  ('10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'manual', 1.0, 'a0000000-0000-0000-0000-000000000001', NOW()),
  ('10000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'manual', 1.0, 'a0000000-0000-0000-0000-000000000001', NOW())
ON CONFLICT (topic_id, story_id) DO NOTHING;

-- 6. Archetypes (global lenses)
INSERT INTO archetypes (archetype_id, name, description) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Economic', 'Lens focused on fiscal policy, trade, and markets'),
  ('d0000000-0000-0000-0000-000000000002', 'Legal', 'Lens focused on rule of law, rights, and enforcement'),
  ('d0000000-0000-0000-0000-000000000003', 'Moral', 'Lens focused on values, fairness, and community')
ON CONFLICT (name) DO NOTHING;

-- 7. Claims (canonical; few samples)
INSERT INTO claims (claim_id, canonical_text, canonical_hash, subject, predicate, object, metadata) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'ICE has legal authority to enforce immigration laws.', 'hash_claim_1', 'ICE', 'has legal authority to enforce', 'immigration laws', '{}'::jsonb),
  ('e0000000-0000-0000-0000-000000000002', 'Protesters used non-violent civil disobedience.', 'hash_claim_2', 'Protesters', 'used', 'non-violent civil disobedience', '{}'::jsonb),
  ('e0000000-0000-0000-0000-000000000003', 'Voter ID laws protect against in-person impersonation.', 'hash_claim_3', 'Voter ID laws', 'protect against', 'in-person impersonation', '{}'::jsonb)
ON CONFLICT (canonical_hash) DO NOTHING;

-- 8. Story-claims (link stories to claims)
INSERT INTO story_claims (story_claim_id, story_id, raw_text, polarity, extraction_confidence, claim_id, run_id)
VALUES
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'ICE has legal authority to enforce immigration laws.', 'asserts', 0.95, 'e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- 9. Theses (claim clusters per topic + archetype)
INSERT INTO theses (thesis_id, topic_id, archetype_id, label, summary, run_id)
VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'Rule of law', 'Emphasizes legal authority and enforcement.', 'a0000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'Community protection', 'Emphasizes human rights and civil disobedience.', 'a0000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'Election security', 'Emphasizes fraud prevention and voter ID.', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (thesis_id) DO NOTHING;

-- 10. Thesis-claims (link claims to theses)
INSERT INTO thesis_claims (thesis_id, claim_id, membership_score, rank, run_id)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 0.9, 1, 'a0000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 0.85, 1, 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (thesis_id, claim_id) DO NOTHING;

-- 11. Viewpoints (archetype-scoped positions per topic)
INSERT INTO viewpoints (viewpoint_id, topic_id, archetype_id, title, summary, run_id)
VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'Enforcement perspective', 'ICE was conducting lawful enforcement; protesters created safety risks.', 'a0000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'Community perspective', 'Community organized peaceful protests to protect neighbors from aggressive enforcement.', 'a0000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'Election integrity perspective', 'Election integrity requires strong voter ID and safeguards against fraud.', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (viewpoint_id) DO NOTHING;

-- 12. Viewpoint-theses (link theses to viewpoints)
INSERT INTO viewpoint_theses (viewpoint_id, thesis_id, weight, run_id)
VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1.0, 'a0000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 1.0, 'a0000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 1.0, 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (viewpoint_id, thesis_id) DO NOTHING;

-- 13. Narratives (cross-topic)
INSERT INTO narratives (narrative_id, title, summary, run_id)
VALUES
  ('40000000-0000-0000-0000-000000000001', 'Federal vs local authority', 'Narrative spanning immigration, elections, and federalism.', 'a0000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', 'Civil liberties and enforcement', 'Narrative on protest, rights, and law enforcement.', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (narrative_id) DO NOTHING;

-- 14. Narrative-viewpoint links
INSERT INTO narrative_viewpoint_links (narrative_id, viewpoint_id, weight, run_id)
VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 0.5, 'a0000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 0.5, 'a0000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 1.0, 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (narrative_id, viewpoint_id) DO NOTHING;
