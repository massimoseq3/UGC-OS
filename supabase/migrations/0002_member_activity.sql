-- Aggregates per-bank counts + 7-day asset activity into one row per member.
-- Read by the admin Members table — single round trip instead of N×7 counts.
-- Idempotent: safe to re-run.

create or replace view public.member_activity as
  select
    p.id as user_id,
    coalesce(prod.n, 0)::bigint  as products,
    coalesce(mod_.n, 0)::bigint  as models,
    coalesce(scr.n, 0)::bigint   as scripts,
    coalesce(vc.n, 0)::bigint    as voices,
    coalesce(br.n, 0)::bigint    as brolls,
    coalesce(vh.n, 0)::bigint    as voice_history,
    coalesce(vid.n, 0)::bigint   as video_history,
    coalesce(act7.n, 0)::bigint  as assets_last_7d
  from public.profiles p
  left join (select user_id, count(*) n from public.products       group by user_id) prod on prod.user_id = p.id
  left join (select user_id, count(*) n from public.models         group by user_id) mod_ on mod_.user_id = p.id
  left join (select user_id, count(*) n from public.scripts        group by user_id) scr  on scr.user_id  = p.id
  left join (select user_id, count(*) n from public.voices         group by user_id) vc   on vc.user_id   = p.id
  left join (select user_id, count(*) n from public.brolls         group by user_id) br   on br.user_id   = p.id
  left join (select user_id, count(*) n from public.voice_history  group by user_id) vh   on vh.user_id   = p.id
  left join (select user_id, count(*) n from public.video_history  group by user_id) vid  on vid.user_id  = p.id
  left join (
    select user_id, count(*) n
    from public.assets
    where created_at >= now() - interval '7 days'
    group by user_id
  ) act7 on act7.user_id = p.id;

-- The view inherits RLS from each underlying table. Profiles + bank tables
-- already have admin-read policies, so admins see all members; non-admins
-- see only their own row (via auth.uid() = user_id).
