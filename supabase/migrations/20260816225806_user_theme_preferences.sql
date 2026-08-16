-- Persist each signed-in user's theme choices across browsers and devices.

alter table public.users
  add column if not exists theme_mode text not null default 'system'
    check (theme_mode in ('light', 'dark', 'system')),
  add column if not exists theme_light_preset_id uuid
    references public.theme_presets(id) on delete set null,
  add column if not exists theme_dark_preset_id uuid
    references public.theme_presets(id) on delete set null;

comment on column public.users.theme_mode is
  'Preferred color mode. System follows the browser/OS preference.';

comment on column public.users.theme_light_preset_id is
  'Selected global light theme preset; null resolves to the protected Default preset.';

comment on column public.users.theme_dark_preset_id is
  'Selected global dark theme preset; null resolves to the protected Default preset.';

create index if not exists users_theme_light_preset_idx
  on public.users (theme_light_preset_id)
  where theme_light_preset_id is not null;

create index if not exists users_theme_dark_preset_idx
  on public.users (theme_dark_preset_id)
  where theme_dark_preset_id is not null;

drop policy if exists theme_presets_select_authenticated on public.theme_presets;

create policy theme_presets_select_global
  on public.theme_presets
  for select
  to anon, authenticated
  using (true);
