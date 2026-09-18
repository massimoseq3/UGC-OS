-- 0025_access_renewal.sql
--
-- Makes the Lapsed status (0023) fire on a timer instead of only by hand.
--
-- The problem it solves: leaving the Skool community produces no signal we can
-- see — Skool exposes no member-removed webhook, so on_allowlist_delete only
-- fires when the operator edits the allowlist themselves. Until now that meant
-- every cancellation had to be noticed and lapsed by hand, one member at a
-- time, or it was never noticed at all.
--
-- The rule: every member re-enters the current shared access code once every
-- N days (default 30, counted from signup and reset on each redemption). The
-- code is only ever posted inside the community, so knowing the current one is
-- the same proof of membership the signup gate already runs on — which is why
-- ROTATING THE CODE IS WHAT MAKES THIS BITE. A member who cancelled but still
-- remembers an un-rotated code walks straight through their checkpoint.
--
-- Nothing here deletes data, and nothing here stamps lapsed_at. Being due is
-- DERIVED from a deadline, not stored: a stamped flag would need a scheduler
-- to write it, and turning the feature off would then leave every member
-- locked behind a flag nobody cleared. access_renewal_at() is the one place
-- the deadline is computed; is_active() and the client both read it.
--
-- Three ways a member is exempt, all of them deliberate:
--   • access_renewal_days <= 0 — the kill switch (Admin → Allowlist).
--   • app_config.signup_code blank — redeem_access_code REFUSES a blank code,
--     so lapsing on one locks out the whole community with no way back.
--   • is_admin — an operator locked out of their own workspace cannot reach
--     Admin → Allowlist to fix whatever caused it.
--
-- Idempotent: safe to re-run. The one-time baseline below runs only on the
-- first apply, so re-running never moves anybody's deadline.

-- ── The cadence, and the kill switch ───────────────────────────────────────
-- 0 (or NULL) turns automatic renewal off entirely. Changing this value from
-- the admin panel goes through set_access_renewal_days() below, which also
-- re-baselines everyone — see the note there.
alter table public.app_config
  add column if not exists access_renewal_days integer not null default 30;

-- ── profiles.access_renews_at: the member's next checkpoint ────────────────
-- NULL means "never stamped", which resolves to created_at + the cadence —
-- i.e. a brand-new signup's first checkpoint is 30 days after they joined,
-- with no trigger needed to stamp it.
do $$
declare
  fresh boolean := not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'access_renews_at'
  );
begin
  if fresh then
    alter table public.profiles add column access_renews_at timestamptz;

    -- One-time baseline on first apply: every existing member's created_at is
    -- already older than the cadence, so without this the whole community
    -- would land on the access-code screen the moment this deploys. Their
    -- clock starts now instead; members who sign up afterwards fall back to
    -- created_at and are asked on their own signup anniversary.
    update public.profiles
       set access_renews_at = now()
           + make_interval(days => greatest(
               coalesce((select access_renewal_days from public.app_config where id), 30), 1));
  end if;
end$$;

-- ── New signups get stamped at insert ──────────────────────────────────────
-- A column default rather than a rewrite of on_auth_user_created (0001): the
-- profile row is inserted on signup, so "now + cadence" and "signup date +
-- cadence" are the same moment, and every row ends up carrying a real date the
-- admin table can show. The coalesce fallback in access_renewal_at() stays as
-- belt-and-braces for any row that predates this default.
create or replace function public.default_access_renewal()
returns timestamptz
language sql
security definer
volatile
set search_path = public
as $$
  select now() + make_interval(days => greatest(
    coalesce((select access_renewal_days from public.app_config where id), 30), 1));
$$;

alter table public.profiles
  alter column access_renews_at set default public.default_access_renewal();

-- ── access_renewal_at(): the effective deadline, or NULL when exempt ───────
-- SECURITY DEFINER to read profiles + app_config past RLS, exactly like
-- is_admin() / is_active(). STABLE so the planner evaluates it once per
-- statement rather than once per row of a bank table.
create or replace function public.access_renewal_at(p_id uuid)
returns timestamptz
language sql
security definer
stable
set search_path = public
as $$
  select case
    when coalesce(cfg.access_renewal_days, 0) <= 0        then null  -- feature off
    when nullif(btrim(cfg.signup_code), '') is null       then null  -- no code to redeem
    when p.is_admin                                       then null  -- operator exempt
    else coalesce(p.access_renews_at,
                  p.created_at + make_interval(days => cfg.access_renewal_days))
  end
  from public.profiles p
  cross join public.app_config cfg
  where p.id = p_id and cfg.id;
$$;

-- A missing profile row or a missing config row yields no rows, hence NULL,
-- hence false — the same fail-open posture is_active() has taken since 0012.
create or replace function public.access_renewal_due(p_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.access_renewal_at(p_id) <= now(), false);
$$;

revoke all on function public.access_renewal_at(uuid) from public, anon;
revoke all on function public.access_renewal_due(uuid) from public, anon;

-- ── is_active(): now also false past the checkpoint ────────────────────────
-- This is the ONLY enforcement that matters. The client's lock screen is
-- courtesy; a member who skips it still cannot read or write a single bank
-- row, because every *_self_all policy (0012) is gated on this function.
create or replace function public.is_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select disabled_at is null and lapsed_at is null from public.profiles where id = auth.uid()),
    true
  ) and not public.access_renewal_due(auth.uid());
$$;

-- ── Guard access_renews_at against self-service edits ──────────────────────
-- profiles_self_update (0001) restricts no columns, so without this a member
-- could simply push their own deadline a year out and never see the code
-- screen again. Same shape as 0023's lapsed_at guard, same transaction-local
-- GUC escape hatch for redeem_access_code.
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.is_admin is distinct from old.is_admin)
     or (new.disabled_at is distinct from old.disabled_at) then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Not authorized to change is_admin or disabled_at'
        using errcode = 'P0001';
    end if;
  end if;

  if (new.lapsed_at is distinct from old.lapsed_at)
     or (new.access_renews_at is distinct from old.access_renews_at)
     or (new.code_attempts is distinct from old.code_attempts)
     or (new.code_attempt_at is distinct from old.code_attempt_at) then
    if auth.uid() is not null
       and not public.is_admin()
       and coalesce(current_setting('app.redeeming_code', true), '') <> 'on' then
      raise exception 'Not authorized to change lapsed_at'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_privilege_escalation_trigger on public.profiles;
create trigger prevent_privilege_escalation_trigger
  before update on public.profiles
  for each row execute function public.prevent_privilege_escalation();

-- ── Un-locking a member always restarts their clock ────────────────────────
-- Restore in Admin → Members and on_allowlist_insert both clear lapsed_at /
-- disabled_at without knowing the cadence. Without this they would hand back a
-- member whose deadline is already in the past, i.e. one who is locked out
-- again on their very next load. Doing it here rather than at each call site
-- means there is one rule, and no caller can forget it.
--
-- Fires AFTER prevent_privilege_escalation_trigger (triggers on one event run
-- in name order, p < s), so the guard checks the caller's own edit and this
-- stamp rides along behind it.
create or replace function public.stamp_access_renewal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (old.lapsed_at is not null and new.lapsed_at is null)
     or (old.disabled_at is not null and new.disabled_at is null) then
    new.access_renews_at := now() + make_interval(days => greatest(
      coalesce((select access_renewal_days from public.app_config where id), 30), 1));
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_access_renewal_trigger on public.profiles;
create trigger stamp_access_renewal_trigger
  before update on public.profiles
  for each row execute function public.stamp_access_renewal();

-- ── redeem_access_code(): teach it about the deadline ──────────────────────
-- Three changes from 0023, each one load-bearing:
--
--  1. The early "you aren't locked out" return now also asks whether the
--     member is past their checkpoint. Without it a due member (lapsed_at is
--     NULL — being due is derived, never stamped) would be told ok, the client
--     would refresh, RLS would still refuse, and they would bounce back to
--     this same screen forever.
--  2. Success pushes access_renews_at out by the cadence. Without it a
--     redemption buys nothing and the member is due again immediately.
--  3. The comparison is case-insensitive and the attempt limit is 10 rather
--     than 5. This screen used to be reached only by members who had already
--     left; now every member sees it monthly, and five fat-fingers locking
--     someone out of their own work for an hour is a support ticket, not a
--     defence — the code is short and shared either way.
create or replace function public.redeem_access_code(code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_window constant interval := interval '1 hour';
  attempt_limit  constant integer  := 10;
  uid       uuid := auth.uid();
  expected  text;
  prof      record;
  attempts  integer;
  cadence   integer;
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = 'P0001';
  end if;

  select disabled_at, lapsed_at, code_attempts, code_attempt_at
    into prof
    from public.profiles
   where id = uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'No account found.');
  end if;

  -- A banned account is not a lapsed one. The code is posted in the community,
  -- so without this check every disabled member would hold a way back in.
  if prof.disabled_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Your access has been revoked.');
  end if;

  if prof.lapsed_at is null and not public.access_renewal_due(uid) then
    return jsonb_build_object('ok', true);
  end if;

  -- Attempts older than the window start a fresh count.
  attempts := case
    when prof.code_attempt_at is null or prof.code_attempt_at <= now() - attempt_window then 0
    else prof.code_attempts
  end;

  if attempts >= attempt_limit then
    return jsonb_build_object('ok', false, 'error',
      'Too many incorrect codes. Try again in an hour.');
  end if;

  select nullif(btrim(signup_code), ''), greatest(coalesce(access_renewal_days, 30), 1)
    into expected, cadence
    from public.app_config where id;

  -- Blank code = the signup gate is off. Re-entry then has no secret to check,
  -- so it falls back to being an admin action rather than letting anyone in.
  -- A member can only reach this branch by having been lapsed BY HAND, since
  -- access_renewal_at() refuses to make anyone due while the code is blank.
  if expected is null then
    return jsonb_build_object('ok', false, 'error',
      'Re-entry by code is turned off. Ask in the community to be reinstated.');
  end if;

  perform set_config('app.redeeming_code', 'on', true);

  if lower(btrim(coalesce(code, ''))) is distinct from lower(expected) then
    update public.profiles
       set code_attempts = attempts + 1,
           code_attempt_at = now()
     where id = uid;
    return jsonb_build_object('ok', false,
      'error', 'That access code is incorrect. You can find the current one in the Skool community.',
      'remaining', attempt_limit - (attempts + 1));
  end if;

  -- The cadence is read even when the feature is off (cadence floors at 1), so
  -- a hand-lapsed member redeeming while automatic renewal is disabled still
  -- gets a sane deadline rather than one already in the past.
  update public.profiles
     set lapsed_at = null,
         access_renews_at = now() + make_interval(days => cadence),
         code_attempts = 0,
         code_attempt_at = null
   where id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.redeem_access_code(text) from public, anon;
grant execute on function public.redeem_access_code(text) to authenticated;

-- ── my_access_state(): what the client renders the lock screen from ────────
-- The client cannot read app_config (admin-only RLS) and so cannot tell on its
-- own whether the feature is on or whether a code exists. It must not guess:
-- a client that thinks a member is locked while the server does not would show
-- a code screen that redeem_access_code answers "ok" to, forever. One RPC, the
-- same helpers is_active() uses, so the two can never disagree.
create or replace function public.my_access_state()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'locked',
        p.disabled_at is not null
        or p.lapsed_at is not null
        or public.access_renewal_due(p.id),
      'reason', case
        when p.disabled_at is not null            then 'disabled'
        when p.lapsed_at is not null              then 'lapsed'
        when public.access_renewal_due(p.id)      then 'renewal'
        else null
      end,
      'renews_at', public.access_renewal_at(p.id)
    )
    from public.profiles p
    where p.id = auth.uid()
  ), jsonb_build_object('locked', false, 'reason', null, 'renews_at', null));
$$;

revoke all on function public.my_access_state() from public, anon;
grant execute on function public.my_access_state() to authenticated;

-- ── set_access_renewal_days(): the admin knob, and why it re-baselines ─────
-- Turning the cadence off leaves every deadline frozen in the past. Turning it
-- back on would then mark the entire community due at once — the mass lockout
-- the one-time baseline above exists to avoid. So changing the cadence always
-- restarts everybody's clock, which makes the knob safe to flip in both
-- directions and makes "off" genuinely reversible.
--
-- Admins keep NULL deadlines via access_renewal_at()'s exemption, so stamping
-- them here is harmless and keeps the update a single statement.
create or replace function public.set_access_renewal_days(days integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_days integer := greatest(coalesce(days, 0), 0);
begin
  if not public.is_admin() then
    raise exception 'Not authorized.' using errcode = 'P0001';
  end if;

  update public.app_config
     set access_renewal_days = next_days,
         updated_at = now()
   where id;

  update public.profiles
     set access_renews_at = now() + make_interval(days => greatest(next_days, 1));

  return next_days;
end;
$$;

revoke all on function public.set_access_renewal_days(integer) from public, anon;
grant execute on function public.set_access_renewal_days(integer) to authenticated;
