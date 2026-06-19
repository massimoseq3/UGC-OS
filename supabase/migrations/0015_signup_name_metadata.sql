-- 0015 — seed profile names from signup metadata when the allowlist has none
--
-- The signup form now collects First name + Surname and passes them as Supabase
-- auth user metadata (raw_user_meta_data.first_name / .last_name). The allowlist
-- stays the source of truth (Skool CSV / Zapier), but a member who signs up with
-- a DIFFERENT email than their Skool one won't match an allowlist row — so the
-- names they typed are the only record we have. Fall back to them.
--
-- Precedence: allowlist name (authoritative) → typed signup name.
-- Idempotent: safe to re-run.

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

  -- Fall back to the names supplied at signup (stored in user metadata) when the
  -- allowlist row is absent or unnamed. nullif(trim(...),'') treats blank/whitespace
  -- metadata as "no value" so coalesce keeps looking.
  v_first := coalesce(v_first, nullif(trim(new.raw_user_meta_data->>'first_name'), ''));
  v_last  := coalesce(v_last,  nullif(trim(new.raw_user_meta_data->>'last_name'), ''));

  insert into public.profiles (id, email, first_name, last_name)
  values (new.id, new.email, v_first, v_last)
  on conflict (id) do update
    set first_name = coalesce(excluded.first_name, public.profiles.first_name),
        last_name  = coalesce(excluded.last_name,  public.profiles.last_name);
  return new;
end;
$$;
