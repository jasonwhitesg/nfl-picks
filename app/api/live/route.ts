// GET /api/live?season=2026&week=6
// Live scores, clock and win % for one week, straight from ESPN.
// Read-only: nothing is written to the database. Responses are cached for
// 15 seconds so lots of players polling only reaches ESPN a few times a minute.
import { NextResponse } from "next/server";
import { parseScoreboard } from "@/lib/espnLive";

const CACHE_SECONDS = 15;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const season = Number(searchParams.get("season"));
  const week = Number(searchParams.get("week"));

  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 22) {
    return NextResponse.json({ error: "season and week are required" }, { status: 400 });
  }

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`;
    const res = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    if (!res.ok) throw new Error(`ESPN responded ${res.status}`);
    const games = parseScoreboard(await res.json());

    return NextResponse.json(
      { games, fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=30` } }
    );
  } catch (error) {
    console.error("Live scores error:", error);
    return NextResponse.json({ error: "Live scores unavailable" }, { status: 502 });
  }
}
