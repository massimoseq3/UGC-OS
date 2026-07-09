-- 0016_usage_days.sql
--
-- Usage ledger backing the Dashboard app: one JSONB row per user per local
-- calendar day (id = 'YYYY-MM-DD'), holding generation counts per kind plus
-- estimated kie credits and official-API USD for that day's generations.
-- Written by bankStore.recordUsage on every successful generation and
-- backfilled once from the history banks; rows only ever accumulate, so
-- streaks and savings survive history deletion/clearing.
--
-- IMPORTANT: run this BEFORE deploying the Dashboard frontend — the client
-- hydrates every bank table on sign-in, and a missing usage_days table makes
-- hydrate report per-table errors (which also disables the auto orphan sweep
-- for the session).
--
-- Same shape + policies as 0014's history tables (self policy bakes in
-- is_active(), admin read for the Members/Insights views) with ONE deliberate
-- difference: ids are day keys, which repeat across users, so the primary key
-- is composite (user_id, id) instead of id alone. PostgREST upserts resolve
-- ON CONFLICT against the primary key, so cloudSync's saveRow works unchanged.
-- Idempotent: safe to re-run.

create table if not exists public.usage_days (
  id           text not null,
  user_id      uuid not null references auth.users(id) on delete cascade,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists usage_days_user_idx on public.usage_days(user_id);

alter table public.usage_days enable row level security;

drop policy if exists "usage_days_self_all" on public.usage_days;
create policy "usage_days_self_all" on public.usage_days
  for all
  using (auth.uid() = user_id and public.is_active())
  with check (auth.uid() = user_id and public.is_active());

drop policy if exists "usage_days_admin_read" on public.usage_days;
create policy "usage_days_admin_read" on public.usage_days
  for select using (public.is_admin());
