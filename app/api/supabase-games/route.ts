import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

type GameRow = {
  id: string;
  week: number;
  start_time: string;
  team_a: string;
  team_b: string;
};

export async function GET(req: NextRequest) {
  try {
    // Use both type arguments
    const { data, error } = await supabase
    .from("games")          // first argument: table name string
    .select("*")            // optionally: <GameRow> for typing
    .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching games:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) return NextResponse.json({}, { status: 200 });

    const weeks: Record<
      string,
      { id: string; homeTeam: string; awayTeam: string; date: string; week: number }[]
    > = {};

    data.forEach((game) => {
      const weekKey = `Week ${game.week}`;
      if (!weeks[weekKey]) weeks[weekKey] = [];

      weeks[weekKey].push({
        id: game.id,
        homeTeam: game.team_a,
        awayTeam: game.team_b,
        date: game.start_time,
        week: game.week,
      });
    });

    Object.keys(weeks).forEach((week) => {
      weeks[week].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    });

    return NextResponse.json(weeks);
  } catch (err: any) {
    console.error("Unexpected error fetching games:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}








