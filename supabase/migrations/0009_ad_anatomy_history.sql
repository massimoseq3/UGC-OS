-- Ad Anatomy history (Ad Analyzer tab). JSONB-backed bank table mirroring
-- character_history. One row per analysis. Source ad blobs are NOT stored;
-- only the analysis result + a small first-frame thumbnail ref.

create table if not exists public.ad_anatomy_history (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ad_anatomy_history_user_idx on public.ad_anatomy_history(user_id);

alter table public.ad_anatomy_history enable row level security;

drop policy if exists "ad_anatomy_history_self_all" on public.ad_anatomy_history;
create policy "ad_anatomy_history_self_all" on public.ad_anatomy_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ad_anatomy_history_admin_read" on public.ad_anatomy_history;
create policy "ad_anatomy_history_admin_read" on public.ad_anatomy_history
  for select using (public.is_admin());
