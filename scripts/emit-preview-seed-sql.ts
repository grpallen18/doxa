/**
 * Emit SQL to seed CNN fixture on preview (for MCP execute_sql).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_ID = "15208581-91ae-4454-92bf-d7a16d1a6313";
const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "docs", "sample_extraction.json"), "utf8")
) as {
  story: {
    title: string;
    url: string;
    published_at: string;
    source_name: string;
    article_text: string;
  };
};

const s = fixture.story;
const esc = (v: string) => v.replace(/'/g, "''");

const sql = `
insert into public.sources (name, domain)
values ('${esc(s.source_name)}', 'cnn.com')
on conflict (name) do nothing;

insert into public.stories (story_id, title, url, source_id, published_at, relevance_score)
select
  '${FIXTURE_ID}'::uuid,
  '${esc(s.title)}',
  '${esc(s.url)}',
  src.source_id,
  '${s.published_at}'::timestamptz,
  82
from public.sources src
where src.name = '${esc(s.source_name)}'
on conflict (story_id) do update set
  title = excluded.title,
  url = excluded.url;

insert into public.story_bodies (story_id, content_clean, content_raw)
values ('${FIXTURE_ID}'::uuid, $body$${s.article_text}$body$, $body$${s.article_text}$body$)
on conflict (story_id) do update set
  content_clean = excluded.content_clean,
  content_raw = excluded.content_raw;

delete from public.story_chunks where story_id = '${FIXTURE_ID}'::uuid;
`;

const outPath = process.argv[2] ?? join(process.cwd(), "scripts", ".preview-seed.sql");
writeFileSync(outPath, sql, "utf8");
console.error(`Wrote ${outPath}`);
