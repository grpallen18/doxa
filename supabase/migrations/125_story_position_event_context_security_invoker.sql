-- Ensure story_position_event_context runs as the querying user (respects RLS).
-- Default view behavior is SECURITY DEFINER (owner privileges), which bypasses RLS.

set search_path = public, extensions;

alter view public.story_position_event_context set (security_invoker = true);
