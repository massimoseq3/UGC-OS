-- 0027_error_reports.sql
--
-- Error reports: what broke for members, delivered to Admin → Errors without
-- anyone having to write in.
--
-- The client (utils/errorReporter.ts) reports three kinds of thing:
--   crash  — an app pane fell over and showed "Something went wrong"
--   error  — an uncaught exception or unhandled promise rejection
--   failed — a failure a member was SHOWN (every humanizeError call), minus the
--            ones that are the member's own situation (no key, out of credits,
--            the content filter)
--
-- ONE ROW PER MEMBER PER DISTINCT ERROR, not one per occurrence. A repeat bumps
-- `occurrences` and `last_seen` and replaces the sample fields with the latest
-- one. That is what keeps the table small however noisy a bug is — a render
-- loop throwing a thousand times a second is still one row per member — and it
-- is the shape the admin reads anyway: "this broke 40 times for 6 people".
--
-- Members never write through PostgREST directly. `report_errors` is the only
-- writer, SECURITY DEFINER, so the size caps and the per-member row cap live in
-- exactly one place and can't be skipped from the browser console. Only admins
-- can read.
--
-- IMPORTANT: run this BEFORE deploying the frontend. A missing function makes
-- the reporter give up quietly for the session (reports wait in the member's
-- browser for the next load), and Admin → Errors shows the "run 0027" banner.
--
-- Idempotent: safe to re-run.

-- ── error_reports: one row per member × fingerprint ────────────────────────
create table if not exists public.error_reports (
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Client-computed hash of kind + app + the error with its ids and numbers
  -- stripped, so the same bug from two members lands in one admin group.
  fingerprint  text not null,
  kind         text not null,
  -- The app the member was in when it happened (a dock id from constants.ts).
  app_id       text,
  -- The raw error, scrubbed of keys, tokens and signed URLs on the client.
  message      text not null,
  -- For `failed`: the sentence the member actually read.
  shown        text,
  -- For `failed`: the fallback the call site passed, which names the
  -- operation ("Video generation failed.").
  operation    text,
  stack        text,
  -- Browser, viewport, path, recent app switches, component stack.
  context      jsonb not null default '{}'::jsonb,
  build_id     text,
  occurrences  integer not null default 1,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  primary key (user_id, fingerprint),
  constraint error_reports_kind_check check (kind in ('crash', 'error', 'failed'))
);

create index if not exists error_reports_fingerprint_idx on public.error_reports(fingerprint);

alter table public.error_reports enable row level security;

drop policy if exists "error_reports_admin_read" on public.error_reports;
create policy "error_reports_admin_read" on public.error_reports
  for select using (public.is_admin());

-- ── error_report_status: the admin's triage, per fingerprint ───────────────
-- No row = open. 'resolved' reopens itself the moment a report lands after
-- `updated_at` (the client compares last_seen to it — "Came Back"). 'ignored'
-- stays hidden whatever happens, for noise that isn't ours to fix.
create table if not exists public.error_report_status (
  fingerprint  text primary key,
  status       text not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,
  constraint error_report_status_check check (status in ('resolved', 'ignored'))
);

alter table public.error_report_status enable row level security;

drop policy if exists "error_report_status_admin_all" on public.error_report_status;
create policy "error_report_status_admin_all" on public.error_report_status
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- `updated_at` is stamped by the SERVER on every write. "Came Back" compares it
-- against `last_seen`, which report_errors stamps with now(); letting the
-- admin's browser supply one side would make a skewed laptop clock reopen a
-- bug it just resolved, or hide one that really did come back.
create or replace function public.touch_error_report_status()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists error_report_status_touch on public.error_report_status;
create trigger error_report_status_touch
  before insert or update on public.error_report_status
  for each row execute function public.touch_error_report_status();

-- ── report_errors: the only writer ─────────────────────────────────────────
-- Takes a JSON array of reports and upserts each. Returns how many it wrote.
-- Every field is capped here, not trusted from the client, and a malformed
-- element is skipped rather than failing the batch — one bad report must not
-- cost the good ones sent with it.
--
-- A disabled account is refused. A LAPSED one is not: its lock screen is the
-- one place a bug locks a paying member out, and that is exactly the report
-- worth having.
create or replace function public.report_errors(reports jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  r          jsonb;
  fp         text;
  known      boolean;
  existing   integer;
  written    integer := 0;
  -- Distinct errors kept per member. Past it a NEW error is dropped; one
  -- already on file still counts. Bounds what a runaway client can store.
  row_cap    constant integer := 300;
begin
  if uid is null or jsonb_typeof(reports) is distinct from 'array' then
    return 0;
  end if;
  if exists (select 1 from public.profiles where id = uid and disabled_at is not null) then
    return 0;
  end if;

  select count(*) into existing from public.error_reports where user_id = uid;

  for r in select value from jsonb_array_elements(reports) limit 25 loop
    continue when jsonb_typeof(r) is distinct from 'object';
    continue when coalesce(r->>'kind', '') not in ('crash', 'error', 'failed');
    fp := left(coalesce(r->>'fingerprint', ''), 64);
    continue when fp = '';

    select exists (
      select 1 from public.error_reports where user_id = uid and fingerprint = fp
    ) into known;
    continue when not known and existing >= row_cap;

    insert into public.error_reports as e (
      user_id, fingerprint, kind, app_id, message, shown, operation, stack, context, build_id, occurrences
    ) values (
      uid,
      fp,
      r->>'kind',
      left(r->>'app_id', 64),
      left(coalesce(nullif(r->>'message', ''), '(no message)'), 1000),
      left(r->>'shown', 400),
      left(r->>'operation', 160),
      left(r->>'stack', 4000),
      case
        when jsonb_typeof(r->'context') = 'object' and length((r->'context')::text) <= 8000 then r->'context'
        else '{}'::jsonb
      end,
      left(r->>'build_id', 64),
      case when coalesce(r->>'count', '') ~ '^[0-9]{1,4}$' then greatest((r->>'count')::integer, 1) else 1 end
    )
    on conflict (user_id, fingerprint) do update set
      kind        = excluded.kind,
      app_id      = excluded.app_id,
      message     = excluded.message,
      shown       = excluded.shown,
      operation   = excluded.operation,
      stack       = excluded.stack,
      context     = excluded.context,
      build_id    = excluded.build_id,
      occurrences = least(e.occurrences::bigint + excluded.occurrences, 2000000000)::integer,
      last_seen   = now();

    if not known then
      existing := existing + 1;
    end if;
    written := written + 1;
  end loop;

  return written;
end;
$$;

revoke all on function public.report_errors(jsonb) from public, anon;
grant execute on function public.report_errors(jsonb) to authenticated;

-- ── error_report_groups: what Admin → Errors lists ─────────────────────────
-- One row per fingerprint across every member, with the newest sample's text
-- and the triage status joined on. Stacks and context stay out: the panel
-- fetches those per group, on expand, so the list is light however many
-- errors are on file.
--
-- security_invoker is REQUIRED (see 0011): without it the view runs as its
-- owner and skips RLS, and any signed-in member could read every member's
-- errors from the browser console. With it, only an admin sees a row.
create or replace view public.error_report_groups
with (security_invoker = on) as
  select
    r.fingerprint,
    (array_agg(r.kind      order by r.last_seen desc))[1] as kind,
    (array_agg(r.message   order by r.last_seen desc))[1] as message,
    (array_agg(r.shown     order by r.last_seen desc))[1] as shown,
    (array_agg(r.operation order by r.last_seen desc))[1] as operation,
    (array_agg(r.app_id    order by r.last_seen desc))[1] as app_id,
    (array_agg(r.build_id  order by r.last_seen desc))[1] as build_id,
    count(*)::bigint                                       as members,
    sum(r.occurrences)::bigint                             as occurrences,
    min(r.first_seen)                                      as first_seen,
    max(r.last_seen)                                       as last_seen,
    s.status,
    s.updated_at                                           as status_at
  from public.error_reports r
  left join public.error_report_status s on s.fingerprint = r.fingerprint
  group by r.fingerprint, s.status, s.updated_at;

revoke all on public.error_report_groups from anon;
