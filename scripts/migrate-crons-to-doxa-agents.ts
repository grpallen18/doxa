import fs from 'fs';
import path from 'path';
import { REPO_ROOT } from './agents-lib.ts';

const CRON_MAP: Record<string, string> = {
  'cron_ingest_newsapi.sql': 'doxa-agents/divisions/01-ingestion-engine/01-sourcing/01-ingest-newsapi/schedule.sql',
  'cron_relevance_gate.sql': 'doxa-agents/divisions/01-ingestion-engine/01-sourcing/02-relevance-gate/schedule.sql',
  'cron_scrape_story_content.sql':
    'doxa-agents/divisions/01-ingestion-engine/02-content-acquisition/01-scrape-story-content/schedule.sql',
  'cron_clean_scraped_content.sql':
    'doxa-agents/divisions/01-ingestion-engine/02-content-acquisition/03-clean-scraped-content/schedule.sql',
  'cron_review_pending_stories.sql':
    'doxa-agents/divisions/01-ingestion-engine/02-content-acquisition/04-review-pending-stories/schedule.sql',
  'cron_chunk_story_bodies.sql':
    'doxa-agents/divisions/02-processing-engine/01-document-processing/01-chunk-story-bodies/schedule.sql',
  'cron_extract_chunk_claims.sql':
    'doxa-agents/divisions/02-processing-engine/02-story-extraction/01-extract-story-entities/schedule.sql',
  'cron_merge_story_claims.sql':
    'doxa-agents/divisions/02-processing-engine/03-story-synthesis/01-merge-story-claims/schedule.sql',
  'cron_link_canonical_claims.sql':
    'doxa-agents/divisions/03-semantic-intelligence-engine/01-canonical-knowledge/01-link-canonical-claims/schedule.sql',
  'cron_link_canonical_events.sql':
    'doxa-agents/divisions/03-semantic-intelligence-engine/01-canonical-knowledge/02-link-canonical-events/schedule.sql',
  'cron_update_stance.sql':
    'doxa-agents/divisions/03-semantic-intelligence-engine/01-canonical-knowledge/04-update-stances/schedule.sql',
  'cron_clustering_pipeline.sql':
    'doxa-agents/divisions/03-semantic-intelligence-engine/02-position-intelligence/schedules.sql',
  'cron_discord_daily_health.sql':
    'doxa-agents/divisions/06-business-operations/pipeline-health-monitoring/01-discord-daily-health/schedule.sql',
  'cron_generate_atlas_map.sql':
    'doxa-agents/divisions/06-business-operations/atlas/01-generate-atlas-map/schedule.sql',
  'cron_cleanup_logs.sql':
    'doxa-agents/divisions/06-business-operations/maintenance/02-cleanup-logs/schedule.sql',
  'cron_purge_drop_stories.sql':
    'doxa-agents/divisions/06-business-operations/maintenance/01-purge-drop-stories/schedule.sql',
  'cron_clustering_cleanup.sql':
    'doxa-agents/divisions/06-business-operations/maintenance/03-clustering-cleanup-unschedule/schedule.sql',
};

function main() {
  const supabaseDir = path.join(REPO_ROOT, 'supabase');
  for (const [srcName, destRel] of Object.entries(CRON_MAP)) {
    const src = path.join(supabaseDir, srcName);
    const dest = path.join(REPO_ROOT, destRel);
    if (!fs.existsSync(src)) {
      console.warn(`Skip missing ${srcName}`);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(`${srcName} -> ${destRel}`);
  }

  for (const [srcName] of Object.entries(CRON_MAP)) {
    const src = path.join(supabaseDir, srcName);
    if (fs.existsSync(src)) fs.unlinkSync(src);
  }
  console.log('Removed flat supabase/cron_*.sql files');
}

main();
