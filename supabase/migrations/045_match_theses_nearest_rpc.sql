-- RPC for nearest-neighbor search on theses.centroid_embedding (cosine distance).
-- Used by process_topic Edge Function to link theses to topics.

create or replace function public.match_theses_nearest(
  query_embedding text,
  match_count int default 50,
  min_similarity float default 0.60
)
returns table (thesis_id uuid, distance float, similarity float)
language sql stable
security definer
set search_path = public
as $$
  select
    t.thesis_id,
    (t.centroid_embedding <=> query_embedding::vector)::float as distance,
    (1.0 - (t.centroid_embedding <=> query_embedding::vector)::float)::float as similarity
  from public.theses t
  where t.centroid_embedding is not null
    and (1.0 - (t.centroid_embedding <=> query_embedding::vector)::float) >= min_similarity
  order by t.centroid_embedding <=> query_embedding::vector
  limit match_count;
$$;

comment on function public.match_theses_nearest(text, int, float) is 'Find theses whose centroid_embedding is similar to query; returns thesis_id, distance, similarity. Used by process_topic.';

-- RPC for nearest-neighbor search on topics.topic_embedding (cosine distance).
-- Used by process_topic Edge Function for topic-to-topic relationships.

create or replace function public.match_topics_nearest(
  query_embedding text,
  exclude_topic_id uuid default null,
  match_count int default 10,
  min_similarity float default 0.70
)
returns table (topic_id uuid, distance float, similarity float)
language sql stable
security definer
set search_path = public
as $$
  select
    t.topic_id,
    (t.topic_embedding <=> query_embedding::vector)::float as distance,
    (1.0 - (t.topic_embedding <=> query_embedding::vector)::float)::float as similarity
  from public.topics t
  where t.topic_embedding is not null
    and (exclude_topic_id is null or t.topic_id != exclude_topic_id)
    and (1.0 - (t.topic_embedding <=> query_embedding::vector)::float) >= min_similarity
  order by t.topic_embedding <=> query_embedding::vector
  limit match_count;
$$;

comment on function public.match_topics_nearest(text, uuid, int, float) is 'Find topics whose topic_embedding is similar to query; excludes one topic. Used by process_topic for topic-to-topic links.';
