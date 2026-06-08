-- 0012_enforce_disabled_at.sql
--
-- Security fix: disabling/removing a member (stamping profiles.disabled_at via
-- on_allowlist_delete) was enforced ONLY client-side — the app signs itself out
-- on the next hydrate/token-refresh. No RLS policy and neither Edge function
-- consulted disabled_at, so a removed member with a still-valid (refreshable)
-- JWT kept full read/write/delete on their own bank rows + R2 assets until the
-- token naturally expired, or indefinitely via scripted calls. This closes the
-- Postgres half; the Edge functions (api/r2-sign, api/r2-delete) get a matching
-- disabled check so R2 binary ops are blocked too.
--
-- Approach: an is_active() SECURITY DEFINER helper (mirrors is_admin()) and a
-- rewrite of every per-user `*_self_all` policy to require it. Same policy
-- NAMES as before, so this REPLACES the permissive policy in place rather than
-- adding an OR'd second one.
--
-- profiles self-read/update are intentionally left untouched: the client must
-- still be able to read its own disabled_at to know to sign out, and the 0010
-- trigger already guards the sensitive columns. Admin-read policies are also
-- untouched, so admins can still inspect a disabled member's data for support.
--
-- Idempotent: safe to re-run.

-- ── is_active(): true unless the caller's profile is disabled ───────────────
-- SECURITY DEFINER so it bypasses RLS on profiles (no recursion), exactly like
-- is_admin(). Defaults to true when no profile row is found so a freshly
-- created account is never locked out by a race.
create or replace function public.is_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select disabled_at is null from public.profiles where id = auth.uid()), true);
$$;

-- ── Rewrite every per-user self policy to require is_active() ───────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'projects','products','models','scripts','voices','brolls',
    'voice_history','video_history','music_history','image_history',
    'character_history','ad_anatomy_history','assets'
  ]
  loop
    execute format('drop policy if exists "%I_self_all" on public.%I;', tbl, tbl);
    execute format('
      create policy "%I_self_all" on public.%I
        for all
        using (auth.uid() = user_id and public.is_active())
        with check (auth.uid() = user_id and public.is_active());
    ', tbl, tbl);
  end loop;
end$$;
