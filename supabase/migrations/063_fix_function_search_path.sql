-- Fix function search_path mutable (security advisor 0011).
-- Sets search_path = public on functions that lacked it.

create or replace function public.vector_div_scalar(v vector, s double precision)
returns vector
language sql immutable strict
set search_path = public
as $$
  select (array_agg(t.x / s order by t.ord))::vector
  from unnest(v::real[]) with ordinality as t(x, ord);
$$;

create or replace function public.match_claims_nearest(
  query_embedding text,
  match_count int default 1
)
returns table (claim_id uuid, distance float)
language sql stable
set search_path = public
as $$
  select c.claim_id, (c.embedding <=> query_embedding::vector)::float as distance
  from public.claims c
  where c.embedding is not null
  order by c.embedding <=> query_embedding::vector
  limit match_count;
$$;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
