-- Friendly story IDs: S-{8 Crockford Base32 chars}

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS friendly_id text;

COMMENT ON COLUMN public.stories.friendly_id IS
  'Human-readable story identifier, format S-XXXXXXXX (Crockford Base32).';

CREATE OR REPLACE FUNCTION public.generate_story_friendly_id()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  body text := '';
  i int;
  b int;
BEGIN
  FOR i IN 1..8 LOOP
    b := 1 + floor(random() * 32)::int;
    body := body || substr(alphabet, b, 1);
  END LOOP;
  RETURN 'S-' || body;
END;
$$;

CREATE OR REPLACE FUNCTION public.stories_assign_friendly_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  IF NEW.friendly_id IS NOT NULL AND btrim(NEW.friendly_id) <> '' THEN
    NEW.friendly_id := upper(btrim(NEW.friendly_id));
    RETURN NEW;
  END IF;

  LOOP
    candidate := public.generate_story_friendly_id();
    IF NOT EXISTS (
      SELECT 1 FROM public.stories s WHERE s.friendly_id = candidate
    ) THEN
      NEW.friendly_id := candidate;
      RETURN NEW;
    END IF;
    attempts := attempts + 1;
    IF attempts >= 25 THEN
      RAISE EXCEPTION 'Could not assign unique story friendly_id after % attempts', attempts;
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS stories_assign_friendly_id ON public.stories;

CREATE TRIGGER stories_assign_friendly_id
  BEFORE INSERT ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION public.stories_assign_friendly_id();

DO $$
DECLARE
  r record;
  candidate text;
  attempts int;
  assigned int := 0;
BEGIN
  FOR r IN
    SELECT story_id FROM public.stories WHERE friendly_id IS NULL
  LOOP
    attempts := 0;
    LOOP
      candidate := public.generate_story_friendly_id();
      BEGIN
        UPDATE public.stories
        SET friendly_id = candidate
        WHERE story_id = r.story_id;
        assigned := assigned + 1;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempts := attempts + 1;
        IF attempts >= 25 THEN
          RAISE EXCEPTION 'Backfill failed for story % after % attempts', r.story_id, attempts;
        END IF;
      END;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Assigned friendly_id to % stories', assigned;
END;
$$;

ALTER TABLE public.stories
  ALTER COLUMN friendly_id SET NOT NULL;

ALTER TABLE public.stories
  DROP CONSTRAINT IF EXISTS stories_friendly_id_format_chk;

ALTER TABLE public.stories
  ADD CONSTRAINT stories_friendly_id_format_chk
  CHECK (friendly_id ~ '^S-[0-9A-HJKMNP-TV-Z]{8}$');

CREATE UNIQUE INDEX IF NOT EXISTS stories_friendly_id_unique_idx
  ON public.stories (friendly_id);
