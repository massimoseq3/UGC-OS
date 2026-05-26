-- UGC OS — legal acceptance tracking
--
-- Adds four columns to profiles so we can prove each user agreed to each
-- policy and detect when they need to re-accept after a policy bump.
-- All columns nullable so existing rows don't break; the app gates on
-- policy_version_accepted ≠ POLICY_VERSION and writes all four on accept.
-- Idempotent — safe to re-run.

alter table public.profiles
  add column if not exists tos_accepted_at        timestamptz,
  add column if not exists privacy_accepted_at    timestamptz,
  add column if not exists aup_accepted_at        timestamptz,
  add column if not exists policy_version_accepted text;

comment on column public.profiles.tos_accepted_at        is 'Timestamp when this user last accepted the Terms of Service.';
comment on column public.profiles.privacy_accepted_at    is 'Timestamp when this user last accepted the Privacy Policy.';
comment on column public.profiles.aup_accepted_at        is 'Timestamp when this user last accepted the Acceptable Use Policy.';
comment on column public.profiles.policy_version_accepted is 'POLICY_VERSION string the user accepted. App forces re-accept when this lags the current constant.';
