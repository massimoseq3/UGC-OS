-- 0026_flows.sql
--
-- Flow: the member's canvases of app blocks wired into one run (apps/flow).
--
-- A row is a flow's LAYOUT and SETTINGS (blocks, wires) plus each block's
-- latest results, all inside `data`. What a flow's runs make lands in the
-- history tables like any other generation, stamped with the flow's id
-- (`flowId` inside each history row's data), never the other way round — so
-- deleting a flow can't take a generation with it.
--
-- IMPORTANT: run this BEFORE deploying the frontend — the client hydrates every
-- bank table on sign-in, and a missing table makes hydrate report a per-table
-- error (which also disables the auto orphan sweep for that session).
--
-- Named `flows`, not anything with "projects" in it: there are two 0025 files
-- and a legacy `public.projects` table already.
--
-- Same shape + policies as 0025's playground_projects table. Idempotent: safe
-- to re-run.

create table if not exists public.flows (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists flows_user_idx on public.flows(user_id);

alter table public.flows enable row level security;

drop policy if exists "flows_self_all" on public.flows;
create policy "flows_self_all" on public.flows
  for all
  using (auth.uid() = user_id and public.is_active())
  with check (auth.uid() = user_id and public.is_active());

drop policy if exists "flows_admin_read" on public.flows;
create policy "flows_admin_read" on public.flows
  for select using (public.is_admin());
