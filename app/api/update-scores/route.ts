// app/api/update-scores/route.ts
import { NextResponse } from "next/server";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = 2026;

// This route writes game scores. Keep the service role key on the server only.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type Competitor = {
  homeAway: "home" | "away";
  score?: string;
  team: { abbreviation: string };
};
type Event = {
  id: string;
  date: string;
  status: { type: { state: "pre" | "in" | "post" } };
  competitions: { competitors: Competitor[] }[];
};

const teamMap: Record<string, string> = { WSH: "WAS" };
const normalizeTeam = (abbr: string) => teamMap[abbr] ?? abbr;
const getStatus = (event: Event) =>
  ({ pre: "Scheduled", in: "InProgress", post: "Final" }[event.status?.type?.state] ?? "Scheduled");
const isMondayNight = (date: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", weekday: "long" })
    .format(new Date(date)) === "Monday";

async function fetchEspnWeek(season: number, week: number) {
  const { data } = await axios.get<{ events: Event[] }>(
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
    { params: { dates: season, seasontype: 2, week }, timeout: 15_000 }
  );
  return data.events ?? [];
}

function mapEvent(event: Event, season: number, week: number) {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  const home = competitors.find(c => c.homeAway === "home");
  const away = competitors.find(c => c.homeAway === "away");
  if (!home || !away) return null;

  const team_a = normalizeTeam(home.team.abbreviation);
  const team_b = normalizeTeam(away.team.abbreviation);
  const home_score = home.score == null || home.score === "" ? null : Number(home.score);
  const away_score = away.score == null || away.score === "" ? null : Number(away.score);
  const status = getStatus(event);
  const monday = isMondayNight(event.date);
  const winner = status === "Final" && home_score !== null && away_score !== null && home_score !== away_score
    ? (home_score > away_score ? team_a : team_b) : null;

  return {
    id: event.id, season, week, start_time: event.date, team_a, team_b,
    home_score, away_score, status, winner,
    is_monday_night: monday,
    actual_total_points: monday && status === "Final" && home_score !== null && away_score !== null
      ? home_score + away_score : null,
  };
}

async function refreshWeek(season: number, week: number) {
  const events = await fetchEspnWeek(season, week);
  const games = events.map(event => mapEvent(event, season, week)).filter(
    (game): game is NonNullable<typeof game> => game !== null
  );
  if (games.length === 0) throw new Error(`ESPN returned no games for week ${week}`);
  const { error } = await supabase.from("games").upsert(games, { onConflict: "id" });
  if (error) throw error;
  return { week, count: games.length };
}

async function isAuthorized(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return false;
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("is_admin").eq("user_id", data.user.id).single();
  return !profileError && profile?.is_admin === true;
}

async function updateScores(request: Request) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase server configuration");
    }
    if (!(await isAuthorized(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: config, error: configError } = await supabase
      .from("season_config").select("season_year, current_week").single();
    if (configError) throw configError;
    const season = config?.season_year ?? DEFAULT_SEASON;

    const { data: schedule, error: scheduleError } = await supabase
      .from("games").select("week, start_time").eq("season", season)
      .order("start_time", { ascending: true });
    if (scheduleError) throw scheduleError;

    let games = schedule ?? [];
    if (games.length === 0) {
      // Populate the season once, then select the week from actual kickoff times.
      for (let week = 1; week <= 18; week++) await refreshWeek(season, week);
      const { data, error } = await supabase.from("games").select("week, start_time")
        .eq("season", season).order("start_time", { ascending: true });
      if (error) throw error;
      games = data ?? [];
    }
    if (games.length === 0) throw new Error(`No ${season} schedule found`);

    const now = Date.now();
    const weeks = Array.from(new Set(games.map(game => game.week))).sort((a, b) => a - b);
    const currentWeek = weeks.find(week =>
      games.some(game => game.week === week && new Date(game.start_time).getTime() > now)
    ) ?? weeks[weeks.length - 1];

    // An admin-triggered POST repairs every week played so far. Cron GETs stay small.
    const backfill = request.method === "POST";
    const results = backfill
      ? await Promise.all(weeks.filter(week => week <= currentWeek).map(week => refreshWeek(season, week)))
      : [await refreshWeek(season, currentWeek)];
    const previousWeek = weeks.filter(week => week < currentWeek).at(-1);
    if (!backfill && previousWeek !== undefined) {
      const latestStart = Math.max(...games.filter(game => game.week === previousWeek)
        .map(game => new Date(game.start_time).getTime()));
      // Finish updating Monday scores after the displayed week has advanced.
      if (now - latestStart < 48 * 60 * 60 * 1000) {
        results.push(await refreshWeek(season, previousWeek));
      }
    }

    if (config && config.current_week !== currentWeek) {
      const { error } = await supabase.from("season_config")
        .update({ current_week: currentWeek }).eq("season_year", season);
      if (error) throw error;
    }
    return NextResponse.json({ season, currentWeek, refreshed: results });
  } catch (error) {
    console.error("ESPN refresh error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Score update failed" }, { status: 500 });
  }
}

export async function GET(request: Request) { return updateScores(request); }
export async function POST(request: Request) { return updateScores(request); }
