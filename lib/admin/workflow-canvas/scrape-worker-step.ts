import type { StoryExtractionReviewPayload } from '@/lib/admin/story-extraction-review'
import { formatAdminDateTime } from '@/lib/admin/format-datetime'
import { STORY_STEP_OUTCOME_LABELS } from '@/lib/admin/story-step-runs'

export const SCRAPE_WORKER_STEP_ID = 'scrape-story-content' as const

export function isScrapeWorkerStep(stepId: string | null | undefined): boolean {
  return stepId === SCRAPE_WORKER_STEP_ID
}

export function scrapeWorkerSubtitle(): string {
  return 'cloudflare worker'
}

export function scrapeStoryStateRows(payload: StoryExtractionReviewPayload) {
  const { story } = payload
  return [
    { label: 'Story URL', value: story.url || '—' },
    {
      label: 'Scraped at',
      value: formatAdminDateTime(story.scraped_at),
    },
    {
      label: 'Dispatched at',
      value: formatAdminDateTime(story.scrape_dispatched_at),
    },
    { label: 'Skipped', value: story.scrape_skipped ? 'Yes' : 'No' },
    { label: 'Failed attempts', value: String(story.scrape_fail_count ?? 0) },
  ]
}

export const SCRAPE_PIPELINE_COMPONENTS = [
  {
    name: 'scrape_story_content',
    role: 'Dispatch',
    detail: 'Claims the story and POSTs to the Cloudflare Worker /scrape endpoint.',
  },
  {
    name: 'doxa worker (/scrape)',
    role: 'Extract',
    detail: 'Fetch + Readability (Browser Rendering fallback) → article textContent.',
  },
  {
    name: 'receive_scraped_content',
    role: 'Callback',
    detail: 'Worker callback writes story_bodies.content_raw and clears dispatch flags.',
  },
] as const

export function formatStepRunHistoryLine(outcome: keyof typeof STORY_STEP_OUTCOME_LABELS): string {
  return STORY_STEP_OUTCOME_LABELS[outcome] ?? outcome
}
