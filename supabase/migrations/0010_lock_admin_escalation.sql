-- 0010_lock_admin_escalation.sql
--
-- Security hardening: close two privilege-escalation paths that let any
-- authenticated user make themselves an admin (admin can read every user's
-- profile + bank data and manage the allowlist).
--
--   Path 1 — bootstrap_admin(): this SECURITY DEFINER helper sets is_admin=true
--            for a given email. Postgres grants EXECUTE on new functions to
--            PUBLIC by default, and Supabase exposes public functions as RPC
--            endpoints (POST /rest/v1/rpc/bootstrap_admin). So any logged-in
--            user could call it and promote themselves. We revoke execute from
--            everyone except the table owner (you, via the SQL editor).
--
--   Path 2 — direct profile UPDATE: the "profiles_self_update" RLS policy lets
--            a user update their own row but doesn't restrict WHICH columns, so
--            `update profiles set is_admin = true where id = auth.uid()` would
--            succeed. A BEFORE UPDATE trigger now rejects any change to
--            is_admin / disabled_at unless the caller is already an admin (or
--            there is no end-user JWT — i.e. the SQL editor / service_role /
--            platform triggers, which run with auth.uid() = NULL).
--
-- Idempotent: safe to run more than once.

-- ── Path 1 ────────────────────────────────────────────────────────────────
-- Only the function owner (postgres / SQL editor) can run bootstrap_admin now.
revoke all on function public.bootstrap_admin(text) from public;
revoke all on function public.bootstrap_admin(text) from anon, authenticated;

-- ── Path 2 ────────────────────────────────────────────────────────────────
-- Guard is_admin / disabled_at against self-service changes by normal users.
-- Legitimate paths still work:
--   • You promoting an admin via the SQL editor  → auth.uid() is NULL → allowed
--   • An existing admin acting in-app            → is_admin() is true → allowed
--   • Zapier/service_role allowlist sync         → auth.uid() is NULL → allowed
--   • acceptPolicies()/saveProfile() writes      → don't touch these columns
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.is_admin is distinct from old.is_admin)
     or (new.disabled_at is distinct from old.disabled_at) then
    -- A real end user is present (has a JWT) and is not an admin → reject.
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Not authorized to change is_admin or disabled_at'
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
