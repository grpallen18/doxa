-- Enable RLS on story_bodies and domain_throttle to align with other tables.
-- Edge Functions (receive_scraped_content, scrape_story_content) use service_role and bypass RLS.

ALTER TABLE public.story_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_throttle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read story_bodies" ON public.story_bodies
  FOR SELECT USING (true);

CREATE POLICY "Public read domain_throttle" ON public.domain_throttle
  FOR SELECT USING (true);
