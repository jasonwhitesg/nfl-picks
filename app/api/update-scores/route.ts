// app/api/update-scores/route.ts
import { NextResponse } from "next/server";
import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

const DEFAULT_SEASON = 2026;

interface Competitor {
  homeAway: "home" | "away";
  score: string;
  team: {
    abbreviation: string;
    displayName: string;
  };
}

interface Event {
  id: string;
  date: string;
  name: string;
  status: {
    type: {
      state: "pre" | "in" | "post";
    };
  };
  competitions: {
    competitors: Competitor[];
  }[];
}

const teamMap: Record<string, string> = {
  WSH: "WAS",
  LAR: "LAR",
  LAC: "LAC",
};

function normalizeTeam(abbr: string) {
  return teamMap[abbr] || abbr;
}

function getStatus(event: Event) {
  const state = event.status?.type?.state;

  if (state === "pre") return "Scheduled";
  if (state === "in") return "InProgress";
  if (state === "post") return "Final";

  return "Scheduled";
}

function isMondayNight(dateString: string) {
  const day = new Date(dateString).toLocaleDateString("en-US", {
    timeZone: "America/Denver",
    weekday: "long",
  });

  return day === "Monday";
}

async function getSeasonConfig() {
  const { data, error } = await supabase
    .from("season_config")
    .select("season_year, current_week")
    .single();

  if (error) {
    console.error("season_config error:", error.message);
    return {
      season: DEFAULT_SEASON,
      currentWeek: 1,
    };
  }

  return {
    season: data?.season_year ?? DEFAULT_SEASON,
    currentWeek: data?.current_week ?? 1,
  };
}

async function fetchEspnWeek(season: number, week: number) {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` +
    `?dates=${season}&seasontype=2&week=${week}`;

  const response = await axios.get<{ events: Event[] }>(url);
  return response.data.events ?? [];
}

function mapEspnEventToGame(event: Event, season: number, week: number) {
  const competitors = event.competitions?.[0]?.competitors ?? [];

  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");

  if (!home || !away) return null;

  const homeTeam = normalizeTeam(home.team.abbreviation);
  const awayTeam = normalizeTeam(away.team.abbreviation);

  const homeScore =
    home.score !== undefined && home.score !== "" ? Number(home.score) : null;

  const awayScore =
    away.score !== undefined && away.score !== "" ? Number(away.score) : null;

  const status = getStatus(event);

  let winner: string | null = null;

  if (
    status === "Final" &&
    homeScore !== null &&
    awayScore !== null &&
    homeScore !== awayScore
  ) {
    winner = homeScore > awayScore ? homeTeam : awayTeam;
  }

  const mondayNight = isMondayNight(event.date);

  const actualTotalPoints =
    mondayNight &&
    status === "Final" &&
    homeScore !== null &&
    awayScore !== null
      ? homeScore + awayScore
      : null;

  return {
    id: event.id,
    week,
    season,

    // Keep ESPN time as UTC. Do NOT convert here.
    start_time: event.date,

    // Your app uses team_a as home and team_b as away.
    team_a: homeTeam,
    team_b: awayTeam,

    home_score: homeScore,
    away_score: awayScore,
    winner,
    status,
    is_monday_night: mondayNight,
    actual_total_points: actualTotalPoints,
    sportsdata_game_id: null,
  };
}

async function loadFullSchedule(season: number) {
  const allGames: any[] = [];

  for (let week = 1; week <= 18; week++) {
    const events = await fetchEspnWeek(season, week);

    for (const event of events) {
      const game = mapEspnEventToGame(event, season, week);
      if (game) allGames.push(game);
    }
  }

  if (allGames.length === 0) {
    return {
      count: 0,
      message: "No ESPN games found",
    };
  }

  const { error } = await supabase
    .from("games")
    .upsert(allGames, { onConflict: "id" });

  if (error) throw error;

  return {
    count: allGames.length,
    message: `Full ${season} schedule loaded from ESPN`,
  };
}

async function refreshCurrentWeek(season: number, week: number) {
  const events = await fetchEspnWeek(season, week);
  const gamesToUpsert: any[] = [];

  for (const event of events) {
    const game = mapEspnEventToGame(event, season, week);
    if (game) gamesToUpsert.push(game);
  }

  if (gamesToUpsert.length === 0) {
    return {
      count: 0,
      message: `No games found for week ${week}`,
    };
  }

  const { error } = await supabase
    .from("games")
    .upsert(gamesToUpsert, { onConflict: "id" });

  if (error) throw error;

  return {
    count: gamesToUpsert.length,
    message: `Week ${week} times and scores refreshed from ESPN`,
  };
}

export async function GET() {
  try {
    const { season, currentWeek } = await getSeasonConfig();

    const { count, error: countError } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("season", season);

    if (countError) throw countError;

    if (!count || count === 0) {
      const result = await loadFullSchedule(season);

      return NextResponse.json({
        action: "full_schedule_loaded",
        season,
        ...result,
      });
    }

    const result = await refreshCurrentWeek(season, currentWeek);

    return NextResponse.json({
      action: "current_week_refreshed",
      season,
      week: currentWeek,
      ...result,
    });
  } catch (err: any) {
    console.error("ESPN refresh error:", err);

    return NextResponse.json(
      {
        error: err.message ?? "Failed to refresh ESPN schedule",
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}






