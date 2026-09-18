-- 0025_playground_projects.sql
--
-- Playground projects: the member's own grouping of Playground generations.
--
-- A row is a NAME and nothing else. The generations point at it (`projectId` on
-- each image / video / music history row), never the other way round, so this
-- table stays a handful of short rows however many generations are filed under
-- a project, a rename is one row's write, and deleting a project can't take a
-- generation with it — the history rows keep an id that no longer resolves,
-- which the app reads as unfiled and shows under All Generations.
--
-- IMPORTANT: run this BEFORE deploying the frontend — the client hydrates every
-- bank table on sign-in, and a missing table makes hydrate report a per-table
-- error (which also disables the auto orphan sweep for that session).
--
-- Same shape + policies as 0024's tracked_accounts table. Idempotent: safe to
-- re-run.

create table if not exists public.playground_projects (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  data         jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists playground_projects_user_idx on public.playground_projects(user_id);

alter table public.playground_projects enable row level security;

drop policy if exists "playground_projects_self_all" on public.playground_projects;
create policy "playground_projects_self_all" on public.playground_projects
  for all
  using (auth.uid() = user_id and public.is_active())
  with check (auth.uid() = user_id and public.is_active());

drop policy if exists "playground_projects_admin_read" on public.playground_projects;
create policy "playground_projects_admin_read" on public.playground_projects
  for select using (public.is_admin());
