-- Add url and domain to scrape_log for identifying rate-limited sources.
alter table public.scrape_log
  add column if not exists url text,
  add column if not exists domain text;

create index if not exists idx_scrape_log_domain on public.scrape_log(domain);

comment on column public.scrape_log.url is 'Story URL that was scraped.';
comment on column public.scrape_log.domain is 'Hostname from URL (e.g. nytimes.com). Use for GROUP BY to find rate-limited sources.';
