-- UGC Lab — initial schema
-- Run this in Supabase SQL Editor (or via `supabase db push` if using the CLI).
-- Idempotent: safe to re-run.
--
-- Order matters: `profiles` must exist before `allowlist` because the
-- allowlist's admin policy references it. We also use a SECURITY DEFINER
-- `is_admin()` helper to avoid RLS self-recursion on the profiles table.

-- ─────────────────────────────────────────────────────────────────────
-- 0. is_admin() helper — bypasses RLS to check the caller's admin flag.
--    Used by every "admin can read/write" policy below.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 1. profiles  (one row per auth.users entry)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text not null,
  display_name      text,
  kie_api_key       text,
  per_app_model     jsonb not null default '{}'::jsonb,
  active_project_id uuid,
  is_admin          boolean not null default false,
  disabled_at       timestamptz,
  created_at        timestamptz not null default now(),
  last_active_at    timestamptz
);

create index if not exists profiles_email_idx on public.profiles(lower(email));

alter table public.profiles enable row level security;

drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read" on public.profiles
  for select using (public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 2. allowlist  (Zapier writes here; signup is gated on it)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.allowlist (
  email       text primary key,
  source      text not null default 'skool',     -- 'skool' | 'manual' | 'invite'
  added_at    timestamptz not null default now(),
  notes       text
);

alter table public.allowlist enable row level security;

-- Only admins read or write the allowlist. End users never see it.
drop policy if exists "allowlist_admin_all" on public.allowlist;
create policy "allowlist_admin_all" on public.allowlist
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 3. Auth triggers
-- ─────────────────────────────────────────────────────────────────────
-- Reject signups whose email isn't in `allowlist`. Fires before profile
-- creation, so a denied user never gets a profile row.
create or replace function public.enforce_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.allowlist where lower(email) = lower(new.email)) then
    raise exception 'Email % is not on the access list. Join the Skool community first.', new.email
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_allowlist_trigger on auth.users;
create trigger enforce_allowlist_trigger
  before insert on auth.users
  for each row execute function public.enforce_allowlist();

-- Auto-create a profile row on successful signup.
create or replace function public.on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_trigger on auth.users;
create trigger on_auth_user_created_trigger
  after insert on auth.users
  for each row execute function public.on_auth_user_created();

-- When an email is removed from `allowlist`, mark the matching profile as
-- disabled. The app checks `disabled_at` on hydration and signs the user out.
create or replace function public.on_allowlist_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set disabled_at = now()
    where lower(email) = lower(old.email);
  return old;
end;
$$;

drop trigger if exists on_allowlist_delete_trigger on public.allowlist;
create trigger on_allowlist_delete_trigger
  after delete on public.allowlist
  for each row execute function public.on_allowlist_delete();

-- Re-enable a previously disabled user when they're re-added to allowlist.
create or replace function public.on_allowlist_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set disabled_at = null
    where lower(email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists on_allowlist_insert_trigger on public.allowlist;
create trigger on_allowlist_insert_trigger
  after insert on public.allowlist
  for each row execute function public.on_allowlist_insert();

-- ─────────────────────────────────────────────────────────────────────
-- 4. Bank tables (one per bank, all JSONB-backed)
-- ─────────────────────────────────────────────────────────────────────
-- Each bank stores the full item shape in `data` (matching TypeScript
-- types), plus extracted columns for filtering: user_id, project_ids,
-- created_at. Anything we want to query/sort on at scale is denormalized;
-- everything else stays in JSONB.
do $$
declare
  bank text;
begin
  foreach bank in array array['projects','products','models','scripts','voices','brolls','voice_history','video_history']
  loop
    execute format('
      create table if not exists public.%I (
        id           text primary key,
        user_id      uuid not null references auth.users(id) on delete cascade,
        project_ids  uuid[] not null default ''{}''::uuid[],
        data         jsonb not null,
        created_at   timestamptz not null default now(),
        updated_at   timestamptz not null default now()
      );
    ', bank);

    execute format('create index if not exists %I_user_idx on public.%I(user_id);', bank, bank);
    execute format('create index if not exists %I_projects_idx on public.%I using gin(project_ids);', bank, bank);

    execute format('alter table public.%I enable row level security;', bank);

    execute format('drop policy if exists "%I_self_all" on public.%I;', bank, bank);
    execute format('
      create policy "%I_self_all" on public.%I
        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
    ', bank, bank);

    execute format('drop policy if exists "%I_admin_read" on public.%I;', bank, bank);
    execute format('
      create policy "%I_admin_read" on public.%I
        for select using (public.is_admin());
    ', bank, bank);
  end loop;
end$$;

-- ─────────────────────────────────────────────────────────────────────
-- 5. assets  (asset:// ref → R2 object key)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.assets (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  r2_key      text not null,
  mime_type   text not null,
  byte_size   bigint not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists assets_user_idx on public.assets(user_id);

alter table public.assets enable row level security;

drop policy if exists "assets_self_all" on public.assets;
create policy "assets_self_all" on public.assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "assets_admin_read" on public.assets;
create policy "assets_admin_read" on public.assets
  for select using (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 6. Helpers for the Admin page
-- ─────────────────────────────────────────────────────────────────────
-- Per-user storage usage (for the admin members table).
create or replace view public.member_storage as
  select
    user_id,
    coalesce(sum(byte_size), 0)::bigint as total_bytes,
    count(*)::bigint as asset_count
  from public.assets
  group by user_id;

-- Bootstrap: promote a user to admin by email. Run this once after your
-- own account is created.
--   select public.bootstrap_admin('you@example.com');
create or replace function public.bootstrap_admin(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set is_admin = true
    where lower(email) = lower(target_email);
end;
$$;
