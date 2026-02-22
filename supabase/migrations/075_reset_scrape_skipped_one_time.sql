-- One-time reset: undo accidental scrape_skipped from Cloudflare Worker malfunction (Feb 2026).
-- Gives affected stories a fresh chance to be scraped now that Worker is rolled back.

update public.stories
set scrape_skipped = false, scrape_fail_count = 0
where scrape_skipped = true;
