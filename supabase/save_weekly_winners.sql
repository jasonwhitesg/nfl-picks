-- Auto-save weekly winners
-- =========================
-- Adds two functions and one scheduled job. Nothing here edits or deletes
-- existing rows; it only INSERTS winners for weeks that have none yet.
--
-- Rules (from the game rules):
--   * A week counts only when every game in it is Final.
--   * Only PAID players can win. Most correct picks wins.
--   * Ties are broken by the closest Monday Night total guess.
--     A guess of 0 or no guess counts as "no tiebreaker".
--     If nobody tied for the lead has a guess, they are co-winners.
--   * An unpaid player gets a "would have won" row (is_paid_winner = false)
--     only if they have strictly MORE correct picks than the paid winner.
--   * If no one paid that week, nothing is saved.
--   * is_tied = true when more than one person shares the win.


-- 1) Work out the winners for one week (read only, saves nothing).
--    Handy for checking:  select * from public.weekly_winner_results(2026, 6);
create or replace function public.weekly_winner_results(p_season int, p_week int)
returns table (
  player_name    text,
  correct_picks  int,
  tiebreaker     int,
  is_paid_winner boolean,
  is_tied        boolean
)
language sql
stable
set search_path = public
as $$
  with wk_games as (
    select * from games where season = p_season and week = p_week
  ),
  mnf as (
    select coalesce(actual_total_points, home_score + away_score) as actual
    from wk_games
    where is_monday_night and status = 'Final'
    limit 1
  ),
  players as (
    select
      pr.user_id,
      pr.username,
      count(*) filter (
        where g.status = 'Final' and g.winner is not null and gp.selected_team = g.winner
      )::int as correct,
      nullif(max(gp.total_points) filter (where g.is_monday_night), 0) as mnf_guess
    from game_picks gp
    join wk_games g  on g.id = gp.game_id
    join profiles pr on pr.user_id = gp.user_id
    group by pr.user_id, pr.username
  ),
  scored as (
    select
      p.username,
      p.correct,
      abs(p.mnf_guess - (select actual from mnf))::int as tiebreaker,
      exists (
        select 1 from weekly_payments wp
        where wp.user_id = p.user_id
          and wp.season_year = p_season
          and wp.week_number = p_week
          and wp.is_paid
      ) as is_paid
    from players p
  ),
  -- Paid players: most correct, then closest Monday total
  paid_top as (
    select * from scored
    where is_paid and correct = (select max(correct) from scored where is_paid)
  ),
  paid_winners as (
    select * from paid_top
    where tiebreaker is not distinct from (select min(tiebreaker) from paid_top)
  ),
  -- Unpaid players: only if they beat the paid winner outright
  unpaid_top as (
    select * from scored
    where not is_paid
      and correct = (select max(correct) from scored where not is_paid)
      and correct > (select max(correct) from paid_winners)
  ),
  unpaid_winners as (
    select * from unpaid_top
    where tiebreaker is not distinct from (select min(tiebreaker) from unpaid_top)
  )
  select username, correct, tiebreaker, true,
         (select count(*) from paid_winners) > 1
  from paid_winners
  union all
  select username, correct, tiebreaker, false,
         (select count(*) from unpaid_winners) > 1
  from unpaid_winners;
$$;


-- 2) Save winners for every finished week of the current season that has
--    no saved winners yet. Safe to run as often as you like.
create or replace function public.save_weekly_winners()
returns int
language plpgsql
set search_path = public
as $$
declare
  v_season int;
  v_week   int;
  v_saved  int := 0;
  v_rows   int;
begin
  select season_year into v_season from season_config limit 1;

  for v_week in
    select g.week
    from games g
    where g.season = v_season
    group by g.week
    having count(*) > 0
       and bool_and(g.status = 'Final')
       and not exists (
         select 1 from weekly_winners w
         where w.season = v_season and w.week = g.week
       )
    order by g.week
  loop
    insert into weekly_winners
      (season, week, player_name, correct_picks, tiebreaker, is_paid_winner, is_tied)
    select v_season, v_week, r.player_name, r.correct_picks, r.tiebreaker,
           r.is_paid_winner, r.is_tied
    from weekly_winner_results(v_season, v_week) r
    on conflict (season, week, player_name) do nothing;

    get diagnostics v_rows = row_count;
    v_saved := v_saved + v_rows;
  end loop;

  return v_saved;
end;
$$;


-- 3) Only the database itself (the scheduled job) may run these.
revoke execute on function public.weekly_winner_results(int, int) from public, anon, authenticated;
revoke execute on function public.save_weekly_winners() from public, anon, authenticated;


-- 4) Run 5 minutes after each score update (at :05, :20, :35, :50).
select cron.schedule(
  'save-weekly-winners',
  '5-59/15 * * * *',
  $$ select public.save_weekly_winners(); $$
);
