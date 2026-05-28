export function normalizeBlockingPart(value: string | null | undefined): string {
  if (!value?.trim()) return "unknown";
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_");
}

export function dateBucket(
  eventDate: string | null | undefined,
  timeframeStart: string | null | undefined,
  timeframeEnd: string | null | undefined
): string {
  const d = eventDate ?? timeframeStart ?? timeframeEnd;
  if (d && /^\d{4}-\d{2}-\d{2}/.test(String(d))) return String(d).slice(0, 7);
  return "unknown";
}

export function buildBlockingKey(params: {
  primary_actor?: string | null;
  action?: string | null;
  event_date?: string | null;
  event_timeframe_start?: string | null;
  event_timeframe_end?: string | null;
  topic_hint?: string | null;
}): string {
  const actor = normalizeBlockingPart(params.primary_actor);
  const act = normalizeBlockingPart(params.action);
  const bucket = dateBucket(params.event_date, params.event_timeframe_start, params.event_timeframe_end);
  const topic = params.topic_hint?.trim() || "unknown";
  return `${actor}|${act}|${bucket}|${topic}`;
}
