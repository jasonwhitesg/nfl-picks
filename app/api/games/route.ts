import { NextResponse } from "next/server";
import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

const API_KEY = "91dbdb354ff441729d0e968729bfd040"; // Free schedule API
const SEASON = 2025;

export async function GET() {
  try {
    // Use SchedulesBasic to avoid fake scores
    const res = await axios.get(
      `https://api.sportsdata.io/v3/nfl/scores/json/SchedulesBasic/${SEASON}`,
      { headers: { "Ocp-Apim-Subscription-Key": API_KEY } }
    );

    const games = res.data;
    const weeks: Record<string, any[]> = {};
    const gamesToUpsert: any[] = [];

    for (const game of games) {
      const gameDate = new Date(game.DateTimeUTC || game.DateTime || game.Date);

      const weekKey = `Week ${game.Week ?? "Unknown"}`;
      if (!weeks[weekKey]) weeks[weekKey] = [];

      const newGame = {
        id: game.GameKey?.toString(),
        week: game.Week,
        season: SEASON,
        start_time: gameDate.toISOString(),
        team_a: game.HomeTeam,
        team_b: game.AwayTeam,
        sportsdata_game_id: game.GameKey?.toString(),
        winner: null,       // no scores yet
        home_score: null,   // no scores
        away_score: null,   // no scores
        status: "Scheduled" // default status
      };

      gamesToUpsert.push(newGame);
      weeks[weekKey].push(newGame);
    }

    const { error } = await supabase
      .from("games")
      .upsert(gamesToUpsert, { onConflict: "id" });

    if (error) {
      console.error("Supabase upsert error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    Object.keys(weeks).forEach((week) => {
      weeks[week].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    });

    return NextResponse.json(weeks);
  } catch (err) {
    console.error("Error fetching or saving games:", err);
    return NextResponse.json({ error: "Failed to fetch NFL games" }, { status: 500 });
  }
}