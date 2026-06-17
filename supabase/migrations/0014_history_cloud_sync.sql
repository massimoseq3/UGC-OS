-- 0014_history_cloud_sync.sql
--
-- Make Scripts history and B-Roll history durable. Both were local-only
-- (browser localStorage + IndexedDB), so Safari/WebKit ITP's 7-day eviction —
-- and any "clear site data" in Chromium browsers — silently wiped them with no
-- cloud copy to restore from. Every other bank already mirrors to Postgres;
-- these two now match. JSONB-backed, same shape as character_history.
--
-- B-Roll session rows are small (asset:// refs + metadata, not blobs — the
-- card media already lives in R2 via video_history / image_history), so this
-- adds little storage on top of what those banks already mirror.
--
-- The self policy bakes in is_active() (see 0012) so a disabled member with a
-- still-valid JWT can't read/write these tables. New tables do NOT inherit
-- 0012's rewrite — that targeted a fixed table list — so it's set here directly.
--
-- Idempotent: safe to re-run.

do $$
declare
  tbl text;
begin
  foreach tbl in array array['script_history','broll_history']
  loop
    execute format('
      create table if not exists public.%I (
        id           text primary key,
        user_id      uuid not null references auth.users(id) on delete cascade,
        data         jsonb not null,
        created_at   timestamptz not null default now(),
        updated_at   timestamptz not null default now()
      );
    ', tbl);

    execute format('create index if not exists %I_user_idx on public.%I(user_id);', tbl, tbl);

    execute format('alter table public.%I enable row level security;', tbl);

    execute format('drop policy if exists "%I_self_all" on public.%I;', tbl, tbl);
    execute format('
      create policy "%I_self_all" on public.%I
        for all
        using (auth.uid() = user_id and public.is_active())
        with check (auth.uid() = user_id and public.is_active());
    ', tbl, tbl);

    execute format('drop policy if exists "%I_admin_read" on public.%I;', tbl, tbl);
    execute format('
      create policy "%I_admin_read" on public.%I
        for select using (public.is_admin());
    ', tbl, tbl);
  end loop;
end$$;
