-- Drop legacy position-clustering subtopics (unused post Neo overhaul).
-- Truncate story_step_runs audit rows from deleted pipeline steps.

DROP TABLE IF EXISTS public.position_subtopics CASCADE;
DROP TABLE IF EXISTS public.subtopics CASCADE;

TRUNCATE TABLE public.story_step_runs;
