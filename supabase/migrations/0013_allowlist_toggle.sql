-- 0013_allowlist_toggle.sql
--
-- Adds a global on/off switch for allowlist enforcement so the operator can
-- open signups while Skool→Zapier sync isn't wired yet, then re-gate later.
--
-- When enforcement is OFF, the enforce_allowlist trigger short-circuits and
-- anyone can create an account. When ON (the default), signup still requires
-- the email to be on public.allowlist — i.e. the original behaviour.
--
-- Turning enforcement back ON only gates NEW signups; accounts created while
-- it was off keep working until you disable them (Admin → Members) or, once
-- Zapier is live, a Skool removal drops them from the allowlist and the
-- on_allowlist_delete trigger stamps disabled_at.
--
-- Idempotent: safe to re-run.

-- ── app_config: a single-row table of global toggles ───────────────────────
-- The `id` column is constrained to true so there can only ever be one row.
create table if not exists public.app_config (
  id                 boolean primary key default true,
  enforce_allowlist  boolean not null default true,
  updated_at         timestamptz not null default now(),
  constraint app_config_singleton check (id)
);

-- Seed the single row (defaults to enforcement ON — no behaviour change on
-- existing deployments).
insert into public.app_config (id) values (true) on conflict (id) do nothing;

alter table public.app_config enable row level security;

-- Admin-only: only admins can read or flip the toggle. The signup trigger
-- reads it as SECURITY DEFINER (below), so it doesn't need a broad read policy.
drop policy if exists "app_config_admin_all" on public.app_config;
create policy "app_config_admin_all" on public.app_config
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── enforce_allowlist(): short-circuit when the toggle is off ───────────────
create or replace function public.enforce_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Global kill-switch: when enforcement is disabled, allow any signup.
  -- Treat a missing config row as "enforce" (fail closed).
  if coalesce((select enforce_allowlist from public.app_config where id), true) is false then
    return new;
  end if;

  if not exists (select 1 from public.allowlist where lower(email) = lower(new.email)) then
    raise exception 'Email % is not on the access list. Join the Skool community first.', new.email
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
