-- Phone notifications (Web Push)
-- ==============================
-- Adds two tables, two functions and one scheduled job.
-- Nothing here edits or deletes existing rows.
--
--   push_subscriptions  one row per phone/browser that tapped "Allow notifications".
--                       Players see and manage only their own rows.
--   notification_log    what has already been sent, so nobody gets the same one twice.
--                       Only the server can read or write it.
--
-- What gets sent (only to players who turned notifications on):
--   * Pick reminder, about 45-60 min before each lock time, ONLY if the player
--     still has unpicked games locking at that time. Games that already locked
--     are never mentioned. The first lock of the week (usually Thursday) says
--     "Week N starts with ... you have until Sunday for the rest".
--   * Group invite, within 15 minutes of an owner inviting them.
--   * Weekly winner, once per week when the paid winner is saved (only weeks
--     saved in the last 3 days, so turning notifications on doesn't replay old weeks).
--
-- Requires: supabase/rls_policies.sql (uses private.pick_lock_time).
-- Undo: supabase/notifications_rollback.sql

begin;

-- 1) Tables -------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(user_id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

create table if not exists public.notification_log (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.profiles(user_id) on delete cascade,
  kind     text not null,   -- 'pick_reminder' | 'group_invite' | 'weekly_winner'
  ref      text not null,   -- what it was about, e.g. 'pick:2026-10-25T20:05:00Z'
  sent_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
);

alter table public.push_subscriptions enable row level security;
alter table public.notification_log   enable row level security;

revoke all on public.push_subscriptions, public.notification_log from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy "players see own phones" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "players add own phones" on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "players update own phones" on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "players remove own phones" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));
-- notification_log: no policies = only the server (service role) can use it.

-- 2) What is due to be sent right now (read only; the sender logs what it sends)
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

-- The sender proves it was called by the scheduler with this shared secret.
create or replace function public.check_notify_secret(p_secret text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'notify_secret' and decrypted_secret = p_secret);
$$;

revoke execute on function public.pending_notifications() from public, anon, authenticated;
revoke execute on function public.check_notify_secret(text) from public, anon, authenticated;
grant execute on function public.pending_notifications() to service_role;
grant execute on function public.check_notify_secret(text) to service_role;

-- 3) Shared secret for the scheduler -> sender call (random, never printed)
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notify_secret',
                           'Scheduler -> send-notifications edge function')
where not exists (select 1 from vault.secrets where name = 'notify_secret');

-- 4) Every 15 minutes, ask the sender to send whatever is due.
select cron.schedule(
  'send-notifications',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url     := 'https://niipnwubpyapyxronaez.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')),
    body    := '{}'::jsonb
  );
  $job$
);

commit;
