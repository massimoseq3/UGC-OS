-- Character history (Characters tab). JSONB-backed bank table mirroring
-- image_history. One row per Characters generation.

create table if not exists public.character_history (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists character_history_user_idx on public.character_history(user_id);

alter table public.character_history enable row level security;

drop policy if exists "character_history_self_all" on public.character_history;
create policy "character_history_self_all" on public.character_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "character_history_admin_read" on public.character_history;
create policy "character_history_admin_read" on public.character_history
  for select using (public.is_admin());
