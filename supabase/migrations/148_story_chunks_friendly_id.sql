-- Friendly chunk IDs: K-{8 Crockford Base32 chars}

ALTER TABLE public.story_chunks
  ADD COLUMN IF NOT EXISTS friendly_id text;

COMMENT ON COLUMN public.story_chunks.friendly_id IS
  'Human-readable chunk identifier, format K-XXXXXXXX (Crockford Base32).';

CREATE OR REPLACE FUNCTION public.generate_chunk_friendly_id()
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
  RETURN 'K-' || body;
END;
$$;

CREATE OR REPLACE FUNCTION public.story_chunks_assign_friendly_id()
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
    candidate := public.generate_chunk_friendly_id();
    IF NOT EXISTS (
      SELECT 1 FROM public.story_chunks sc WHERE sc.friendly_id = candidate
    ) THEN
      NEW.friendly_id := candidate;
      RETURN NEW;
    END IF;
    attempts := attempts + 1;
    IF attempts >= 25 THEN
      RAISE EXCEPTION 'Could not assign unique chunk friendly_id after % attempts', attempts;
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS story_chunks_assign_friendly_id ON public.story_chunks;

CREATE TRIGGER story_chunks_assign_friendly_id
  BEFORE INSERT ON public.story_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.story_chunks_assign_friendly_id();

DO $$
DECLARE
  r record;
  candidate text;
  attempts int;
  assigned int := 0;
BEGIN
  FOR r IN
    SELECT story_id, chunk_index
    FROM public.story_chunks
    WHERE friendly_id IS NULL
    ORDER BY story_id, chunk_index
  LOOP
    attempts := 0;
    LOOP
      candidate := public.generate_chunk_friendly_id();
      BEGIN
        UPDATE public.story_chunks
        SET friendly_id = candidate
        WHERE story_id = r.story_id AND chunk_index = r.chunk_index;
        assigned := assigned + 1;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempts := attempts + 1;
        IF attempts >= 25 THEN
          RAISE EXCEPTION 'Backfill failed for chunk %/% after % attempts',
            r.story_id, r.chunk_index, attempts;
        END IF;
      END;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Assigned friendly_id to % story chunks', assigned;
END;
$$;

ALTER TABLE public.story_chunks
  ALTER COLUMN friendly_id SET NOT NULL;

ALTER TABLE public.story_chunks
  DROP CONSTRAINT IF EXISTS story_chunks_friendly_id_format_chk;

ALTER TABLE public.story_chunks
  ADD CONSTRAINT story_chunks_friendly_id_format_chk
  CHECK (friendly_id ~ '^K-[0-9A-HJKMNP-TV-Z]{8}$');

CREATE UNIQUE INDEX IF NOT EXISTS story_chunks_friendly_id_unique_idx
  ON public.story_chunks (friendly_id);
