-- 0011_security_invoker_views.sql
--
-- Security fix: the member_storage (0001) and member_activity (0002) helper
-- views were created WITHOUT `security_invoker`. A Postgres view defaults to
-- running its underlying query as the view OWNER (the migration role, which
-- also owns the base tables and is exempt from their RLS unless FORCE ROW
-- LEVEL SECURITY is set). So RLS on assets/profiles/products/... was NOT
-- applied when querying through these views, and Supabase grants SELECT on
-- public views to `authenticated` by default. Net effect: ANY logged-in
-- member could run `select * from member_storage` / `member_activity` from the
-- browser console and read EVERY member's user_id + storage totals + per-bank
-- object counts — a cross-tenant roster + usage-profile leak.
--
-- The 0002 comment ("non-admins see only their own row via auth.uid()=user_id")
-- was simply false for a non-invoker view.
--
-- Fix: flip both views to security_invoker so the underlying-table RLS (the
-- existing `*_self_all` self policies + `*_admin_read` admin policies) is
-- enforced against the CALLER. A non-admin then sees only their own aggregate
-- row; an admin (via the admin-read policies) still sees every member. The
-- admin Members table keeps working unchanged.
--
-- Requires PostgreSQL 15+ (Supabase is on 15+). Idempotent.

alter view public.member_storage  set (security_invoker = on);
alter view public.member_activity set (security_invoker = on);

-- Defense in depth: anon never has a legitimate reason to read these. (RLS
-- would already filter anon to zero rows once security_invoker is on, since
-- auth.uid() is null, but make the intent explicit.)
revoke all on public.member_storage  from anon;
revoke all on public.member_activity from anon;
