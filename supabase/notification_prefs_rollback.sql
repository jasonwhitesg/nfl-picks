-- Undo supabase/notification_prefs.sql: puts back the original reminders
-- (everyone with notifications on gets the 1-hour reminder, group invites and
-- weekly winners) and removes the players' saved choices.
begin;

create or replace function public.pending_notifications()
returns table (user_id uuid, kind text, ref text, title text, body text, url text)
language sql stable security definer
set search_path = ''
as $$
  with cfg as (select season_year from public.season_config limit 1),
  subs as (select distinct s.user_id from public.push_subscriptions s),
  g as (
    select gm.id, gm.week, gm.team_a, gm.team_b, gm.start_time, gm.is_monday_night,
           private.pick_lock_time(gm.id) as lock_at
    from public.games gm, cfg where gm.season = cfg.season_year
  ),
  first_lock as (select week, min(lock_at) as lock_at from g group by week),
  win as (
    select distinct week, lock_at from g
    where lock_at > now() and lock_at <= now() + interval '60 minutes'
  ),
  unpicked as (
    select s.user_id, w.week, w.lock_at, g.team_b || ' @ ' || g.team_a as matchup,
           g.start_time, g.is_monday_night
    from subs s
    join win w on true
    join g on g.week = w.week and g.lock_at = w.lock_at
    where not exists (select 1 from public.game_picks p
                      where p.user_id = s.user_id and p.game_id = g.id)
  ),
  reminders as (
    select u.user_id, u.week, u.lock_at,
           count(*) as n,
           string_agg(u.matchup, ', ' order by u.start_time, u.matchup) filter (where u.rn <= 3) as first3,
           bool_or(u.is_monday_night) as has_mnf,
           (u.lock_at = fl.lock_at) as is_first,
           (select count(*) from g g2
             where g2.week = u.week and g2.lock_at > u.lock_at
               and not exists (select 1 from public.game_picks p
                               where p.user_id = u.user_id and p.game_id = g2.id)) as later
    from (select *, row_number() over (partition by user_id, lock_at order by start_time, matchup) as rn
          from unpicked) u
    join first_lock fl on fl.week = u.week
    group by u.user_id, u.week, u.lock_at, fl.lock_at
  ),
  reminder_msgs as (
    select r.user_id, 'pick_reminder'::text as kind,
           'pick:' || to_char(r.lock_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') as ref,
           'Week ' || r.week || ' picks lock soon' as title,
           case
             when r.is_first and r.n = 1 and r.later > 0 then
               'Week ' || r.week || ' starts with ' || r.first3 || ' at '
               || to_char(r.lock_at at time zone 'America/Denver', 'FMHH12:MI AM')
               || '. Make that pick now - you have time to think about the other '
               || r.later || ' games.'
             else
               r.n || case when r.n = 1 then ' game locks' else ' games lock' end || ' at '
               || to_char(r.lock_at at time zone 'America/Denver', 'FMHH12:MI AM')
               || ' and you haven''t picked: ' || r.first3
               || case when r.n > 3 then ' and ' || (r.n - 3) || ' more' else '' end || '.'
               || case when r.has_mnf then ' Includes Monday night - set your total points.' else '' end
               || case when r.later > 0 then ' ' || r.later || ' more to pick after that.' else '' end
           end as body,
           '/make-picks'::text as url
    from reminders r
  ),
  invite_msgs as (
    select m.user_id, 'group_invite'::text, 'invite:' || m.id::text,
           'Group invite'::text,
           'You''ve been invited to join "' || gr.name || '". Open the app to accept or decline.',
           '/'::text
    from public.group_members m
    join public.groups gr on gr.id = m.group_id and gr.is_active
    join subs s on s.user_id = m.user_id
    where m.status = 'invited'
  ),
  winner_weeks as (
    select w.season, w.week,
           string_agg(w.player_name, ' and ' order by w.player_name) as names,
           count(*) as n, max(w.correct_picks) as correct
    from public.weekly_winners w, cfg
    where w.season = cfg.season_year and w.is_paid_winner
      and w.created_at > now() - interval '3 days'
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
    from winner_weeks ww cross join subs s
  ),
  everything as (
    select * from reminder_msgs
    union all select * from invite_msgs
    union all select * from winner_msgs
  )
  select e.* from everything e
  where not exists (select 1 from public.notification_log l
                    where l.user_id = e.user_id and l.kind = e.kind and l.ref = e.ref);
$$;

revoke execute on function public.pending_notifications() from public, anon, authenticated;
grant execute on function public.pending_notifications() to service_role;

drop table if exists public.notification_prefs;

commit;
