-- Phone notification choices: each player picks which notifications they get.
--
-- Run after supabase/notifications.sql.
--   notification_prefs  one row per player (no row = the defaults below).
--                       Players see and change only their own row.
--   pending_notifications() now follows those choices:
--     * Pick reminders 1 day, 2 hours and/or 1 hour before each lock time,
--       still ONLY if the player has unpicked games locking then.
--     * Game results: each game's final score and whether the player's pick was right.
--     * Weekly winner and group invites can each be turned off. The weekly winner
--       only goes out for a week that just ended (re-saving an old week is silent).
-- Undo: supabase/notification_prefs_rollback.sql

begin;

create table if not exists public.notification_prefs (
  user_id        uuid primary key references public.profiles(user_id) on delete cascade,
  remind_1d      boolean not null default false,
  remind_2h      boolean not null default false,
  remind_1h      boolean not null default true,
  game_results   boolean not null default false,
  weekly_winner  boolean not null default true,
  group_invites  boolean not null default true,
  updated_at     timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon, authenticated;
grant select, insert, update on public.notification_prefs to authenticated;

create policy "players see own choices" on public.notification_prefs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "players add own choices" on public.notification_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "players change own choices" on public.notification_prefs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.pending_notifications()
returns table (user_id uuid, kind text, ref text, title text, body text, url text)
language sql stable security definer
set search_path = ''
as $$
  with cfg as (select season_year from public.season_config limit 1),
  subs as (
    -- Everyone with a phone signed up, with their choices (defaults if they never changed any)
    select s.user_id,
           coalesce(np.remind_1d, false)    as remind_1d,
           coalesce(np.remind_2h, false)    as remind_2h,
           coalesce(np.remind_1h, true)     as remind_1h,
           coalesce(np.game_results, false) as game_results,
           coalesce(np.weekly_winner, true) as weekly_winner,
           coalesce(np.group_invites, true) as group_invites
    from (select distinct ps.user_id from public.push_subscriptions ps) s
    left join public.notification_prefs np on np.user_id = s.user_id
  ),
  g as (
    select gm.id, gm.week, gm.team_a, gm.team_b, gm.start_time, gm.is_monday_night,
           private.pick_lock_time(gm.id) as lock_at
    from public.games gm, cfg where gm.season = cfg.season_year
  ),
  first_lock as (select week, min(lock_at) as lock_at from g group by week),
  -- Which reminder times each player wants, in minutes before lock
  wants as (
    select s.user_id, o.mins
    from subs s
    cross join lateral (values (1440, s.remind_1d), (120, s.remind_2h), (60, s.remind_1h)) as o(mins, enabled)
    where o.enabled
  ),
  -- A reminder is due from its time until 30 minutes later (the scheduler runs every 15)
  due as (
    select distinct w.user_id, w.mins, g.week, g.lock_at
    from wants w
    join g on g.lock_at > now()
          and now() >= g.lock_at - make_interval(mins => w.mins)
          and now() <  g.lock_at - make_interval(mins => w.mins) + interval '30 minutes'
  ),
  unpicked as (
    select d.user_id, d.mins, d.week, d.lock_at, g.team_b || ' @ ' || g.team_a as matchup,
           g.start_time, g.is_monday_night
    from due d
    join g on g.week = d.week and g.lock_at = d.lock_at
    where not exists (select 1 from public.game_picks p
                      where p.user_id = d.user_id and p.game_id = g.id)
  ),
  reminders as (
    select u.user_id, u.mins, u.week, u.lock_at,
           count(*) as n,
           string_agg(u.matchup, ', ' order by u.start_time, u.matchup) filter (where u.rn <= 3) as first3,
           bool_or(u.is_monday_night) as has_mnf,
           (u.lock_at = fl.lock_at) as is_first,
           (select count(*) from g g2
             where g2.week = u.week and g2.lock_at > u.lock_at
               and not exists (select 1 from public.game_picks p
                               where p.user_id = u.user_id and p.game_id = g2.id)) as later
    from (select *, row_number() over (partition by user_id, mins, lock_at order by start_time, matchup) as rn
          from unpicked) u
    join first_lock fl on fl.week = u.week
    group by u.user_id, u.mins, u.week, u.lock_at, fl.lock_at
  ),
  reminder_msgs as (
    select r.user_id, 'pick_reminder'::text as kind,
           'pick' || r.mins || ':' || to_char(r.lock_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as ref,
           'Week ' || r.week || ' picks lock '
           || case r.mins when 1440 then 'tomorrow' when 120 then 'in 2 hours' else 'in 1 hour' end as title,
           case
             when r.is_first and r.n = 1 and r.later > 0 then
               'Week ' || r.week || ' starts with ' || r.first3 || ' at ' || r.lock_text
               || '. Make that pick now - you have time to think about the other '
               || r.later || ' games.'
             else
               r.n || case when r.n = 1 then ' game locks' else ' games lock' end || ' at ' || r.lock_text
               || ' and you haven''t picked: ' || r.first3
               || case when r.n > 3 then ' and ' || (r.n - 3) || ' more' else '' end || '.'
               || case when r.has_mnf then ' Includes Monday night - set your total points.' else '' end
               || case when r.later > 0 then ' ' || r.later || ' more to pick after that.' else '' end
           end as body,
           '/make-picks'::text as url
    from (select r.*,
                 to_char(r.lock_at at time zone 'America/Denver',
                         case when r.mins = 1440 then 'FMDay FMHH12:MI AM' else 'FMHH12:MI AM' end) as lock_text
          from reminders r) r
  ),
  -- Games that went final recently (started in the last 5 hours, so turning this on doesn't replay old games)
  result_msgs as (
    select s.user_id, 'game_result'::text, 'final:' || gm.id,
           'Final: ' || gm.team_b || ' ' || coalesce(gm.away_score, 0)
             || ', ' || gm.team_a || ' ' || coalesce(gm.home_score, 0),
           case
             when p.selected_team is null then 'You didn''t pick this game.'
             when gm.winner is null then 'Tie game - you picked ' || p.selected_team || '.'
             when p.selected_team = gm.winner then 'You picked ' || p.selected_team || ' - right!'
             else 'You picked ' || p.selected_team || ' - wrong.'
           end,
           '/pick-summary'::text
    from public.games gm
    join cfg on gm.season = cfg.season_year
    join subs s on s.game_results
    left join public.game_picks p on p.game_id = gm.id and p.user_id = s.user_id
    where gm.status = 'Final' and gm.start_time > now() - interval '5 hours'
  ),
  invite_msgs as (
    select m.user_id, 'group_invite'::text, 'invite:' || m.id::text,
           'Group invite'::text,
           'You''ve been invited to join "' || gr.name || '". Open the app to accept or decline.',
           '/'::text
    from public.group_members m
    join public.groups gr on gr.id = m.group_id and gr.is_active
    join subs s on s.user_id = m.user_id and s.group_invites
    where m.status = 'invited'
  ),
  winner_weeks as (
    select w.season, w.week,
           string_agg(w.player_name, ' and ' order by w.player_name) as names,
           count(*) as n, max(w.correct_picks) as correct
    from public.weekly_winners w, cfg
    where w.season = cfg.season_year and w.is_paid_winner
      and w.created_at > now() - interval '3 days'
      -- only a week that just ended, so re-saving an old week doesn't announce it again
      and (select max(gm.start_time) from public.games gm
           where gm.season = w.season and gm.week = w.week) > now() - interval '3 days'
    group by w.season, w.week
  ),
  winner_msgs as (
    select s.user_id, 'weekly_winner'::text, 'winner:' || ww.season || '-' || ww.week,
           'Week ' || ww.week || ' winner',
           case when ww.n > 1
             then ww.names || ' tied for the win with ' || ww.correct || ' correct.'
             else ww.names || ' won Week ' || ww.week || ' with ' || ww.correct || ' correct.'
           end,
           '/standings'::text
    from winner_weeks ww join subs s on s.weekly_winner
  ),
  everything as (
    select * from reminder_msgs
    union all select * from result_msgs
    union all select * from invite_msgs
    union all select * from winner_msgs
  )
  select e.* from everything e
  where not exists (select 1 from public.notification_log l
                    where l.user_id = e.user_id and l.kind = e.kind and l.ref = e.ref);
$$;

revoke execute on function public.pending_notifications() from public, anon, authenticated;
grant execute on function public.pending_notifications() to service_role;

commit;
