-- Seed topic and subtopic taxonomy for position-first architecture.
-- Truncates existing topics/subtopics, inserts 10 topics + subtopics (including "Other" per topic).

set search_path = public, extensions;

-- Truncate in dependency order (subtopics refs topics, position_subtopics refs subtopics)
truncate table public.position_subtopics cascade;
truncate table public.subtopics cascade;
truncate table public.topics cascade;

-- Insert 10 topics (use name for controlled vocab; title for display compat)
insert into public.topics (topic_id, slug, title, name, summary, status, metadata) values
  (gen_random_uuid(), 'geopolitics', 'Geopolitics & International Relations', 'Geopolitics & International Relations', null, 'published', '{}'),
  (gen_random_uuid(), 'us-politics', 'U.S. Politics & Governance', 'U.S. Politics & Governance', null, 'published', '{}'),
  (gen_random_uuid(), 'economics', 'Economics & Fiscal Policy', 'Economics & Fiscal Policy', null, 'published', '{}'),
  (gen_random_uuid(), 'technology', 'Technology & Society', 'Technology & Society', null, 'published', '{}'),
  (gen_random_uuid(), 'culture', 'Culture & Social Issues', 'Culture & Social Issues', null, 'published', '{}'),
  (gen_random_uuid(), 'health', 'Health & Bioethics', 'Health & Bioethics', null, 'published', '{}'),
  (gen_random_uuid(), 'energy', 'Energy & Environment', 'Energy & Environment', null, 'published', '{}'),
  (gen_random_uuid(), 'media', 'Media & Information', 'Media & Information', null, 'published', '{}'),
  (gen_random_uuid(), 'defense', 'Defense & Security', 'Defense & Security', null, 'published', '{}'),
  (gen_random_uuid(), 'law', 'Law & Civil Liberties', 'Law & Civil Liberties', null, 'published', '{}');

-- Insert subtopics per topic (using slug to match)
-- Geopolitics
insert into public.subtopics (topic_id, name, description)
select t.topic_id, v.name, null
from public.topics t
cross join (values ('NATO'), ('Russia–Ukraine War'), ('Israel–Palestine'), ('China–Taiwan'),
  ('U.S.–China Relations'), ('Middle East Policy'), ('Sanctions'), ('Foreign Aid'),
  ('Immigration Policy (Cross-border)'), ('Trade Policy'), ('Other')) as v(name)
where t.slug = 'geopolitics';

-- U.S. Politics
insert into public.subtopics (topic_id, name, description)
select t.topic_id, v.name, null
from public.topics t
cross join (values ('Federal Executive Power'), ('Congress & Legislative Process'), ('Supreme Court & Judicial Review'),
  ('Election Integrity'), ('Campaign Finance'), ('Federalism (States vs Federal)'), ('Administrative State'),
  ('Gun Policy'), ('Border Security'), ('Other')) as v(name)
where t.slug = 'us-politics';

-- Economics
insert into public.subtopics (topic_id, name, description)
select t.topic_id, v.name, null
from public.topics t
cross join (values ('Inflation'), ('Interest Rates & Federal Reserve'), ('Tax Policy'), ('Government Spending'),
  ('National Debt'), ('Entitlements (Social Security/Medicare)'), ('Minimum Wage'), ('Tariffs'),
  ('Industrial Policy'), ('Housing Affordability'), ('Other')) as v(name)
where t.slug = 'economics';

-- Technology
insert into public.subtopics (topic_id, name, description)
select t.topic_id, v.name, null
from public.topics t
cross join (values ('Artificial Intelligence Governance'), ('Social Media Regulation'), ('Free Speech Online'),
  ('Data Privacy'), ('Surveillance'), ('Cryptocurrency & CBDCs'), ('Cybersecurity'), ('Open Source vs Closed AI'), ('Other')) as v(name)
where t.slug = 'technology';

-- Culture
insert into public.subtopics (topic_id, name, description)
select t.topic_id, v.name, null
from public.topics t
cross join (values ('Gender Identity Policy'), ('Abortion'), ('Religious Freedom'), ('Affirmative Action'),
  ('Education Curriculum'), ('Policing & Criminal Justice Reform'), ('DEI Policies'), ('Family Policy'), ('Other')) as v(name)
where t.slug = 'culture';

-- Health
insert into public.subtopics (topic_id, name, description)
select t.topic_id, v.name, null
from public.topics t
cross join (values ('Vaccine Mandates'), ('Pandemic Response'), ('Public Health Authority'), ('FDA Regulation'),
  ('Assisted Suicide'), ('Genetic Editing'), ('Mental Health Policy'), ('Other')) as v(name)
where t.slug = 'health';

-- Energy
insert into public.subtopics (topic_id, name, description)
select t.topic_id, v.name, null
from public.topics t
cross join (values ('Climate Change Policy'), ('Net Zero'), ('Fossil Fuel Expansion'), ('Nuclear Energy'),
  ('ESG Investing'), ('Environmental Regulation'), ('Carbon Taxes'), ('Other')) as v(name)
where t.slug = 'energy';

-- Media
insert into public.subtopics (topic_id, name, description)
select t.topic_id, v.name, null
from public.topics t
cross join (values ('Media Bias'), ('Censorship'), ('Disinformation'), ('Fact-Checking'),
  ('Journalism Standards'), ('Platform Moderation Policies'), ('Other')) as v(name)
where t.slug = 'media';

-- Defense
insert into public.subtopics (topic_id, name, description)
select t.topic_id, v.name, null
from public.topics t
cross join (values ('Military Spending'), ('Defense Industrial Base'), ('NATO Burden Sharing'),
  ('Intelligence Agencies'), ('Domestic Counterterrorism'), ('Other')) as v(name)
where t.slug = 'defense';

-- Law
insert into public.subtopics (topic_id, name, description)
select t.topic_id, v.name, null
from public.topics t
cross join (values ('1st Amendment'), ('2nd Amendment'), ('4th Amendment & Privacy'), ('Due Process'),
  ('Qualified Immunity'), ('Corporate Liability'), ('Other')) as v(name)
where t.slug = 'law';
