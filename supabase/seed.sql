-- Seed data for Doxa prototype
-- Run this after the initial schema migration

-- Insert initial perspectives
INSERT INTO perspectives (id, name, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Conservative', 'Traditional conservative viewpoints emphasizing limited government, individual responsibility, and national security'),
  ('00000000-0000-0000-0000-000000000002', 'Progressive', 'Progressive viewpoints emphasizing social justice, government intervention, and inclusive policies'),
  ('00000000-0000-0000-0000-000000000003', 'Libertarian', 'Libertarian viewpoints emphasizing individual liberty, free markets, and minimal government intervention')
ON CONFLICT (name) DO NOTHING;

-- Node 1: "Are undocumented immigrants eligible for welfare programs?"
INSERT INTO nodes (id, question, status, version, shared_facts) VALUES
  ('10000000-0000-0000-0000-000000000001', 
   'Are undocumented immigrants eligible for welfare programs?', 
   'under_review', 
   1,
   '{"legal_framework": "Personal Responsibility and Work Opportunity Reconciliation Act of 1996", "key_date": "1996", "definition": "Undocumented immigrants are non-citizens without legal authorization to be in the United States"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Node 1 Perspectives
INSERT INTO node_perspectives (node_id, perspective_id, core_claim, key_arguments, emphasis, version) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Undocumented immigrants are generally not eligible for most federal welfare programs, but may access emergency services and state/local programs in some jurisdictions.',
   '["Federal law (PRWORA 1996) restricts most federal benefits to qualified immigrants", "Emergency medical care (EMTALA) must be provided regardless of status", "Some states provide state-funded benefits regardless of federal restrictions", "WIC and school lunch programs may be accessible to children regardless of parent status"]'::jsonb,
   'Emphasizes legal restrictions and enforcement of existing laws',
   1),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'While federal restrictions exist, undocumented immigrants contribute significantly to the economy and should have access to basic services, with many states expanding access.',
   '["Undocumented immigrants pay billions in taxes annually", "Many work essential jobs and contribute to Social Security without receiving benefits", "State and local programs increasingly provide health and education services", "Children of undocumented immigrants are often U.S. citizens eligible for full benefits"]'::jsonb,
   'Emphasizes contributions, human rights, and state-level policy variations',
   1),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003',
   'Welfare eligibility should be based on need and contribution, not immigration status, and government should not restrict access based on citizenship.',
   '["Immigration status should not determine access to basic human needs", "Free markets work best when all participants can access basic services", "Restrictions create perverse incentives and administrative burdens", "Private charity and voluntary associations should play larger role"]'::jsonb,
   'Emphasizes individual liberty and voluntary association over government restrictions',
   1)
ON CONFLICT DO NOTHING;

-- Node 2: "What does CBP mean by an 'encounter'?"
INSERT INTO nodes (id, question, status, version, shared_facts) VALUES
  ('10000000-0000-0000-0000-000000000002',
   'What does CBP mean by an "encounter"?',
   'under_review',
   1,
   '{"agency": "U.S. Customs and Border Protection (CBP)", "definition": "An encounter is a recorded interaction between CBP and an individual", "data_source": "CBP statistics are published monthly"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO node_perspectives (node_id, perspective_id, core_claim, key_arguments, emphasis, version) VALUES
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'An encounter is a straightforward count of individuals encountered by CBP, representing the scale of border challenges and need for enforcement.',
   '["Encounters represent real people attempting to cross illegally", "Numbers reflect the magnitude of border security challenges", "Each encounter requires CBP resources and processing", "High encounter numbers justify increased border security measures"]'::jsonb,
   'Emphasizes enforcement challenges and border security needs',
   1),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
   'Encounter statistics can be misleading because they count the same person multiple times and include legal asylum seekers, inflating the perception of crisis.',
   '["The same person may be counted multiple times if they attempt crossing repeatedly", "Many encounters are with individuals seeking legal asylum", "Title 42 and other policies created repeat encounters", "Statistics should distinguish between unique individuals and repeat encounters"]'::jsonb,
   'Emphasizes methodological issues and context of legal asylum seeking',
   1),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003',
   'Encounter definitions are arbitrary government metrics that obscure individual circumstances and should be replaced with transparent, individual-level data.',
   '["Government metrics serve bureaucratic purposes rather than truth", "Aggregate statistics hide individual stories and circumstances", "Better data would track individuals across time and systems", "Private sector and NGOs could provide more accurate tracking"]'::jsonb,
   'Emphasizes transparency, individual liberty, and skepticism of government metrics',
   1)
ON CONFLICT DO NOTHING;

-- Node 3: "What happened during the Minneapolis ICE protest?"
INSERT INTO nodes (id, question, status, version, shared_facts) VALUES
  ('10000000-0000-0000-0000-000000000003',
   'What happened during the Minneapolis ICE protest?',
   'under_review',
   1,
   '{"location": "Minneapolis, Minnesota", "date_range": "2018", "context": "Part of broader immigration enforcement debates"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO node_perspectives (node_id, perspective_id, core_claim, key_arguments, emphasis, version) VALUES
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
   'ICE was conducting lawful enforcement operations when protesters interfered, creating safety risks and obstructing federal law enforcement.',
   '["ICE has legal authority to enforce immigration laws", "Protesters blocked access and created dangerous situations", "Enforcement actions target individuals who have violated immigration law", "Protest interference undermines rule of law"]'::jsonb,
   'Emphasizes legal authority and rule of law',
   1),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002',
   'Community members organized peaceful protests to protect neighbors from aggressive ICE enforcement that separated families and created fear in immigrant communities.',
   '["ICE operations created fear and trauma in immigrant communities", "Protesters used non-violent civil disobedience to protect neighbors", "Many targeted individuals had no criminal record", "Community solidarity against what many saw as unjust enforcement"]'::jsonb,
   'Emphasizes community protection, human rights, and civil disobedience',
   1),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003',
   'The protest highlighted conflicts between federal immigration enforcement and local communities, with both sides operating within their perceived rights.',
   '["Federal agencies have authority but local communities have autonomy", "Voluntary association and community defense are legitimate", "Immigration enforcement creates conflicts between different levels of government", "Solutions should respect both federal law and local community values"]'::jsonb,
   'Emphasizes federalism, local autonomy, and voluntary association',
   1)
ON CONFLICT DO NOTHING;

-- Node 4: "How does the U.S. asylum process work?"
INSERT INTO nodes (id, question, status, version, shared_facts) VALUES
  ('10000000-0000-0000-0000-000000000004',
   'How does the U.S. asylum process work?',
   'under_review',
   1,
   '{"legal_basis": "Immigration and Nationality Act, Refugee Act of 1980", "key_agencies": "USCIS, EOIR, DOJ", "timeline": "Process can take years"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO node_perspectives (node_id, perspective_id, core_claim, key_arguments, emphasis, version) VALUES
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
   'The asylum process is a legal pathway for genuine refugees but has been exploited, requiring stricter enforcement and faster processing to prevent abuse.',
   '["Asylum is for those with well-founded fear of persecution", "Current system has long backlogs that incentivize illegal entry", "Many asylum claims are ultimately denied, suggesting abuse", "Faster processing and stricter standards needed to maintain system integrity"]'::jsonb,
   'Emphasizes preventing abuse and maintaining system integrity',
   1),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002',
   'The asylum process is a humanitarian system that should be expanded and streamlined, with current backlogs and restrictions violating international obligations.',
   '["U.S. has legal and moral obligations under international refugee law", "Current backlogs create years-long waits that are inhumane", "Restrictions like Remain in Mexico and Title 42 violate due process", "System should be expanded to meet global refugee needs"]'::jsonb,
   'Emphasizes humanitarian obligations and due process rights',
   1),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003',
   'The asylum process is a government-controlled system that should be replaced with private sponsorship and voluntary association models.',
   '["Government bureaucracy creates delays and inefficiencies", "Private sponsorship programs could be faster and more effective", "Voluntary associations and NGOs could handle refugee resettlement", "Market-based solutions would better match refugees with communities"]'::jsonb,
   'Emphasizes private solutions over government bureaucracy',
   1)
ON CONFLICT DO NOTHING;

-- Node 5: "What is the difference between a refugee and an asylee?"
INSERT INTO nodes (id, question, status, version, shared_facts) VALUES
  ('10000000-0000-0000-0000-000000000005',
   'What is the difference between a refugee and an asylee?',
   'stable',
   1,
   '{"legal_definition": "Refugees apply from outside U.S., asylees apply from within U.S.", "same_standard": "Both must meet same persecution standard", "legal_basis": "Refugee Act of 1980"}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO node_perspectives (node_id, perspective_id, core_claim, key_arguments, emphasis, version) VALUES
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
   'The key difference is location of application: refugees apply from abroad through proper channels, while asylees often arrive illegally then apply, creating different enforcement challenges.',
   '["Refugees go through proper vetting process before arrival", "Asylees often arrive illegally then claim asylum", "Different processes require different enforcement approaches", "Refugee resettlement is more controlled and predictable"]'::jsonb,
   'Emphasizes legal process differences and enforcement implications',
   1),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000002',
   'Both refugees and asylees meet the same legal standard for protection; the difference is procedural and should not affect access to protection.',
   '["Both groups face same persecution standard under law", "Location of application is often determined by circumstances beyond individual control", "Asylees often have no safe way to apply from abroad", "Procedural differences should not create hierarchy of deservingness"]'::jsonb,
   'Emphasizes equal protection and circumstances beyond individual control',
   1),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003',
   'The distinction is an arbitrary government classification; what matters is individual circumstances and need for protection, not bureaucratic categories.',
   '["Government categories create artificial distinctions", "Individual circumstances matter more than legal classifications", "Private sponsorship could bypass government categories", "Voluntary association models would focus on need, not status"]'::jsonb,
   'Emphasizes individual circumstances over government classifications',
   1)
ON CONFLICT DO NOTHING;

-- Create relationships between nodes
INSERT INTO node_relationships (source_node_id, target_node_id, relationship_type) VALUES
  -- Node 1 (welfare eligibility) related to Node 4 (asylum process)
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'contextual'),
  ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'contextual'),
  
  -- Node 2 (CBP encounters) related to Node 4 (asylum process)
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 'depends_on'),
  
  -- Node 4 (asylum process) related to Node 5 (refugee vs asylee)
  ('10000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000005', 'parent_child'),
  ('10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000004', 'parent_child'),
  
  -- Node 3 (Minneapolis protest) related to Node 2 (CBP encounters)
  ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'related_event'),
  
  -- Node 1 (welfare) related to Node 2 (encounters) - contextual
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'contextual')
ON CONFLICT DO NOTHING;

-- Add some sample sources
INSERT INTO sources (node_id, perspective_id, url, title, source_type) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 
   'https://www.congress.gov/bill/104th-congress/house-bill/3734', 
   'Personal Responsibility and Work Opportunity Reconciliation Act of 1996', 
   'primary_document'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'https://www.americanprogress.org/article/undocumented-immigrants-state-local-tax-contributions/',
   'Undocumented Immigrants State and Local Tax Contributions',
   'article'),
  ('10000000-0000-0000-0000-000000000002', NULL,
   'https://www.cbp.gov/newsroom/stats',
   'CBP Border Security Report',
   'primary_document'),
  ('10000000-0000-0000-0000-000000000004', NULL,
   'https://www.uscis.gov/humanitarian/refugees-and-asylum/asylum',
   'USCIS Asylum Information',
   'primary_document'),
  ('10000000-0000-0000-0000-000000000005', NULL,
   'https://www.uscis.gov/humanitarian/refugees-and-asylum/refugees',
   'USCIS Refugee Information',
   'primary_document')
ON CONFLICT DO NOTHING;
