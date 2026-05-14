-- Music history (Playground music tab). JSONB-backed bank table mirroring
-- video_history. One row per Suno generation.

create table if not exists public.music_history (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_ids  uuid[] not null default '{}'::uuid[],
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists music_history_user_idx on public.music_history(user_id);
create index if not exists music_history_projects_idx on public.music_history using gin(project_ids);

alter table public.music_history enable row level security;

drop policy if exists "music_history_self_all" on public.music_history;
create policy "music_history_self_all" on public.music_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "music_history_admin_read" on public.music_history;
create policy "music_history_admin_read" on public.music_history
  for select using (public.is_admin());
