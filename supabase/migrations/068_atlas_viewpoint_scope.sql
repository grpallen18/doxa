-- Add viewpoint to Atlas viz schema for viewpoint-driven maps.
-- Enables generate_atlas_map to create maps from controversy_viewpoints instead of theses.

-- Extend enums (cannot add IF NOT EXISTS for enum values in older PG; use DO block)
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'viewpoint'
    and enumtypid = (select oid from pg_type where typname = 'viz_scope_type')
  ) then
    alter type viz_scope_type add value 'viewpoint';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'viewpoint'
    and enumtypid = (select oid from pg_type where typname = 'viz_entity_type')
  ) then
    alter type viz_entity_type add value 'viewpoint';
  end if;
end
$$;

comment on column public.viz_maps.scope_id is 'topic_id, thesis_id, or viewpoint_id depending on scope_type.';
