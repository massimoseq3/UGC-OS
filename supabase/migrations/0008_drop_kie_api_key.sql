-- Drop kie_api_key from profiles. Keys move to per-browser localStorage only;
-- nothing in the cloud holds them anymore. See CLAUDE.md "Auth + cloud sync".
-- Idempotent: safe to re-run.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'kie_api_key'
  ) then
    execute 'update public.profiles set kie_api_key = null where kie_api_key is not null';
    execute 'alter table public.profiles drop column kie_api_key';
  end if;
end$$;
