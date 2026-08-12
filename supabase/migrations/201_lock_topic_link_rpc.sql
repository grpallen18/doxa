-- Lock topic-linker RPC to service_role (SECURITY DEFINER must not be public).

REVOKE ALL ON FUNCTION public.link_graph_controversies_to_topics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_graph_controversies_to_topics() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_graph_controversies_to_topics() TO service_role;
