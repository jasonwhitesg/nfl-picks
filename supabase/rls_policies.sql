-- Row-level security for the NFL Pick'em app
-- ==========================================
-- Turns on RLS for all 8 public tables and adds the rules below.
-- Nothing here edits or deletes existing rows.
--
-- Who is who:
--   anon          = someone with the public key who is NOT signed in
--   authenticated = any signed-in player
--   admin         = signed-in player whose profiles.is_admin = true
--   service_role  = /api/update-scores (server key)   -> skips RLS
--   postgres      = pg_cron jobs and the SQL editor   -> skips RLS
--
-- Rules:
--   games, season_config  read by anyone; only the server/cron can change them
--   profiles              signed-in players read all; you create and edit only
--                         your own name fields; nobody can make themselves admin
--   game_picks            signed-in players read all; you add/change only your
--                         own picks, and only before that game locks (Mountain Time
--                         rules from the Rules page); nobody can delete picks
--   weekly_payments,
--   weekly_winners        signed-in players read; only admins add/change/delete
--   groups                signed-in players read (needed to join by code);
--                         you create groups you own; owner edits/deletes
--   group_members         you see rows in groups you belong to (any status);
--                         owner adds/edits/removes anyone in their group;
--                         you may: request to join (pending), accept your own
--                         invite (invited -> approved), decline it (delete)
--
-- Undo: supabase/rls_rollback.sql

begin;

-- ---------------------------------------------------------------------------
-- 1) Helper functions (private schema, so they are not callable over the API)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.user_id = (select auth.uid())),
    false);
$$;

create or replace function private.owns_group(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_user_id = (select auth.uid()));
$$;

create or replace function private.has_group_row(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group_id and m.user_id = (select auth.uid()));
$$;

-- When a game's pick locks (all Mountain Time):
--   Thu/Fri/Sat and Sunday-before-2 PM games: their own kickoff.
--   Sunday 2 PM-or-later games and Monday games: the first Sunday 2 PM-or-later
--   kickoff of that week (or their own kickoff if earlier / none exists).
create or replace function private.pick_lock_time(p_game_id text)
returns timestamptz
language sql stable security definer
set search_path = ''
as $$
  with g as (
    select season, week, start_time,
           start_time at time zone 'America/Denver' as mt
    from public.games where id = p_game_id
  ),
  wk as (
    select min(o.start_time) as wk_lock
    from public.games o, g
    where o.season is not distinct from g.season
      and o.week = g.week
      and extract(dow from o.start_time at time zone 'America/Denver') = 0
      and (o.start_time at time zone 'America/Denver')::time >= time '14:00'
  )
  select case
           when extract(dow from g.mt) = 1
             or (extract(dow from g.mt) = 0 and g.mt::time >= time '14:00')
           then least(g.start_time, coalesce(wk.wk_lock, g.start_time))
           else g.start_time
         end
  from g, wk;
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Guards that policies cannot express (they need the old row)
-- ---------------------------------------------------------------------------

-- Players cannot save or change a pick once its game has locked.
-- (Not security definer on purpose: current_user must be the caller's role.)
create or replace function private.enforce_pick_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;  -- server, cron and SQL editor are not limited
  end if;
  if now() >= private.pick_lock_time(new.game_id)
     or (tg_op = 'UPDATE' and now() >= private.pick_lock_time(old.game_id)) then
    raise exception 'This game is locked. You cannot change your pick.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_pick_lock on public.game_picks;
create trigger enforce_pick_lock
  before insert or update on public.game_picks
  for each row execute function private.enforce_pick_lock();

-- A membership row can never be moved to another group or another player.
create or replace function private.keep_member_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.group_id <> old.group_id or new.user_id <> old.user_id) then
    raise exception 'Cannot move a membership to another group or player.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists keep_member_keys on public.group_members;
create trigger keep_member_keys
  before update on public.group_members
  for each row execute function private.keep_member_keys();

-- ---------------------------------------------------------------------------
-- 3) Table privileges (what each role may even try)
-- ---------------------------------------------------------------------------
-- Signed-out visitors: read games and season settings only.
revoke all on public.games, public.game_picks, public.profiles, public.season_config,
  public.weekly_payments, public.weekly_winners, public.groups, public.group_members
  from anon;
grant select on public.games, public.season_config to anon;

-- Signed-in players: no TRUNCATE/TRIGGER/REFERENCES anywhere.
revoke truncate, trigger, references on public.games, public.game_picks, public.profiles,
  public.season_config, public.weekly_payments, public.weekly_winners, public.groups,
  public.group_members
  from authenticated;
-- games and season_config are read-only from the browser.
revoke insert, update, delete on public.games, public.season_config from authenticated;
-- profiles: only the three name fields can be edited (never is_admin, email, user_id).
revoke update, delete on public.profiles from authenticated;
grant update (username, first_name, last_name) on public.profiles to authenticated;
-- picks are never deleted from the browser.
revoke delete on public.game_picks from authenticated;

-- ---------------------------------------------------------------------------
-- 4) Turn on RLS and add policies
-- ---------------------------------------------------------------------------
alter table public.games           enable row level security;
alter table public.season_config   enable row level security;
alter table public.profiles        enable row level security;
alter table public.game_picks      enable row level security;
alter table public.weekly_payments enable row level security;
alter table public.weekly_winners  enable row level security;
alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;

-- games / season_config
create policy "games readable by everyone" on public.games
  for select to anon, authenticated using (true);
create policy "season_config readable by everyone" on public.season_config
  for select to anon, authenticated using (true);

-- profiles
create policy "profiles readable by players" on public.profiles
  for select to authenticated using (true);
create policy "players create own profile" on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()) and coalesce(is_admin, false) = false);
create policy "players edit own profile" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- game_picks (lock time is enforced by the enforce_pick_lock trigger)
create policy "picks readable by players" on public.game_picks
  for select to authenticated using (true);
create policy "players add own picks" on public.game_picks
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "players change own picks" on public.game_picks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- weekly_payments
create policy "payments readable by players" on public.weekly_payments
  for select to authenticated using (true);
create policy "admins add payments" on public.weekly_payments
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins change payments" on public.weekly_payments
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete payments" on public.weekly_payments
  for delete to authenticated using ((select private.is_admin()));

-- weekly_winners
create policy "winners readable by players" on public.weekly_winners
  for select to authenticated using (true);
create policy "admins add winners" on public.weekly_winners
  for insert to authenticated with check ((select private.is_admin()));
create policy "admins change winners" on public.weekly_winners
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete winners" on public.weekly_winners
  for delete to authenticated using ((select private.is_admin()));

-- groups
create policy "groups readable by players" on public.groups
  for select to authenticated using (true);
create policy "players create own groups" on public.groups
  for insert to authenticated
  with check (owner_user_id = (select auth.uid()));
create policy "owners edit their groups" on public.groups
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));
create policy "owners delete their groups" on public.groups
  for delete to authenticated
  using (owner_user_id = (select auth.uid()));

-- group_members
create policy "members see their groups' members" on public.group_members
  for select to authenticated
  using (user_id = (select auth.uid())
         or private.owns_group(group_id)
         or private.has_group_row(group_id));

create policy "owners add members" on public.group_members
  for insert to authenticated
  with check (private.owns_group(group_id));
create policy "owners change members" on public.group_members
  for update to authenticated
  using (private.owns_group(group_id))
  with check (private.owns_group(group_id));
create policy "owners remove members" on public.group_members
  for delete to authenticated
  using (private.owns_group(group_id));

create policy "players request to join" on public.group_members
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and status = 'pending' and role = 'member'
              and is_paid = false and paid_at is null);
create policy "players accept own invite" on public.group_members
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'invited')
  with check (user_id = (select auth.uid())
              and status = 'approved' and role = 'member'
              and is_paid = false and paid_at is null);
create policy "players decline own invite" on public.group_members
  for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'invited');

commit;
