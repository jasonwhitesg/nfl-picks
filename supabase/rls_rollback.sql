-- Undo supabase/rls_policies.sql (puts security back to how it was: wide open).
-- Only use this in an emergency if the app breaks after turning on RLS.
begin;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.games           disable row level security;
alter table public.season_config   disable row level security;
alter table public.profiles        disable row level security;
alter table public.game_picks      disable row level security;
alter table public.weekly_payments disable row level security;
alter table public.weekly_winners  disable row level security;
alter table public.groups          disable row level security;
alter table public.group_members   disable row level security;

drop trigger if exists enforce_pick_lock on public.game_picks;
drop trigger if exists keep_member_keys on public.group_members;

grant all on public.games, public.game_picks, public.profiles, public.season_config,
  public.weekly_payments, public.weekly_winners, public.groups, public.group_members
  to anon, authenticated;

drop schema if exists private cascade;

commit;
