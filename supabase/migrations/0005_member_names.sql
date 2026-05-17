-- 0005 — first_name / last_name on allowlist + profiles
--
-- Adds optional name columns to both tables. The allowlist is the source of
-- truth (populated from Skool CSV imports / Zapier); profiles get backfilled
-- via two triggers:
--   • on_allowlist_insert — already runs on every allowlist add; now also
--     copies first_name + last_name into the matching profile row.
--   • on_auth_user_created — runs when a new auth.users row appears; now
--     reads the allowlist row and seeds the profile with the names.
-- Idempotent: safe to re-run.

alter table public.allowlist
  add column if not exists first_name text,
  add column if not exists last_name  text;

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;

-- Updated trigger: when an account is created, seed profile fields (including
-- names from the allowlist row, if present).
create or replace function public.on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text;
  v_last  text;
begin
  select first_name, last_name into v_first, v_last
    from public.allowlist
    where lower(email) = lower(new.email)
    limit 1;

  insert into public.profiles (id, email, first_name, last_name)
  values (new.id, new.email, v_first, v_last)
  on conflict (id) do update
    set first_name = coalesce(excluded.first_name, public.profiles.first_name),
        last_name  = coalesce(excluded.last_name,  public.profiles.last_name);
  return new;
end;
$$;

-- Updated trigger: when an allowlist row is added (or re-added), un-disable
-- the matching profile AND backfill its name fields if they're not set.
create or replace function public.on_allowlist_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set disabled_at = null,
        first_name  = coalesce(public.profiles.first_name, new.first_name),
        last_name   = coalesce(public.profiles.last_name,  new.last_name)
    where lower(email) = lower(new.email);
  return new;
end;
$$;

-- New trigger: when an allowlist row is updated (CSV re-import that brings
-- fresh names), push the names into the matching profile, overwriting any
-- existing value on the profile so the admin's CSV is authoritative.
create or replace function public.on_allowlist_update_names()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.first_name is distinct from old.first_name)
     or (new.last_name is distinct from old.last_name) then
    update public.profiles
      set first_name = new.first_name,
          last_name  = new.last_name
      where lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists on_allowlist_update_names_trigger on public.allowlist;
create trigger on_allowlist_update_names_trigger
  after update on public.allowlist
  for each row execute function public.on_allowlist_update_names();
