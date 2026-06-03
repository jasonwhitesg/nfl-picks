import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: NextRequest) {
  try {
    // Get current season from season_config
    const { data: config, error: configError } = await supabase
      .from("season_config")
      .select("season_year")
      .single();

    if (configError) {
      console.error("Error fetching season config:", configError.message);
      return NextResponse.json({ error: configError.message }, { status: 500 });
    }

    const seasonYear = config?.season_year ?? 2026;

    // Only pull games for current season
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("season", seasonYear)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching games:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) return NextResponse.json({}, { status: 200 });

    const weeks: Record<
      string,
      {
        id: string;
        homeTeam: string;
        awayTeam: string;
        home_score: number | null;
        away_score: number | null;
        winner: string | null;
        status: string;
        date: string;
        week: number;
      }[]
    > = {};

    const now = new Date();

    data.forEach((game) => {
      const weekKey = `Week ${game.week}`;
      if (!weeks[weekKey]) weeks[weekKey] = [];

      const gameTime = new Date(game.start_time);

      let status = game.status;

      if (!status) {
        if (game.home_score != null && game.away_score != null) {
          status = "Final";
        } else if (gameTime <= now) {
          status = "InProgress";
        } else {
          status = "Scheduled";
        }
      }

      const winner =
        game.winner ??
        (game.home_score != null && game.away_score != null
          ? game.home_score > game.away_score
            ? game.team_a
            : game.team_b
          : null);

      weeks[weekKey].push({
        id: game.id,
        homeTeam: game.team_a,
        awayTeam: game.team_b,
        home_score: game.home_score,
        away_score: game.away_score,
        winner,
        status,
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










