// GET /api/live/401873007
// Win probability history (and the pregame prediction) for one game.
// Read-only and cached for 30 seconds, like /api/live.
import { NextResponse } from "next/server";
import { parseSummary } from "@/lib/espnLive";

const CACHE_SECONDS = 30;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid game id" }, { status: 400 });
  }

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`;
    const res = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    if (!res.ok) throw new Error(`ESPN responded ${res.status}`);
    const summary = parseSummary(await res.json());

    return NextResponse.json(summary, {
      headers: { "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=60` },
    });
  } catch (error) {
    console.error("Game summary error:", error);
    return NextResponse.json({ error: "Game details unavailable" }, { status: 502 });
  }
}
