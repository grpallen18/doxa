-- Refresh auto topic links: drop stale auto rows, then re-insert matches.

CREATE OR REPLACE FUNCTION public.link_graph_controversies_to_topics()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked integer := 0;
BEGIN
  DELETE FROM public.graph_topic_links
  WHERE link_method = 'auto';

  INSERT INTO public.graph_topic_links (topic_id, controversy_uid, link_method)
  SELECT t.topic_id, c.uid, 'auto'
  FROM public.graph_controversies c
  INNER JOIN public.topics t
    ON c.topic_key IS NOT NULL
   AND length(trim(c.topic_key)) > 0
   AND c.topic_key NOT LIKE 'sim:%'
   AND c.topic_key <> 'general'
   AND (
     lower(t.slug) = lower(c.topic_key)
     OR lower(coalesce(t.name, '')) = lower(c.topic_key)
     OR lower(t.title) = lower(c.topic_key)
   )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS linked = ROW_COUNT;
  RETURN linked;
END;
$$;

REVOKE ALL ON FUNCTION public.link_graph_controversies_to_topics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_graph_controversies_to_topics() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_graph_controversies_to_topics() TO service_role;
