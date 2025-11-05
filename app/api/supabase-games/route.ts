import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from("games")
      .select("*")
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

    // Current time in Mountain Time
    const nowMST = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Denver" })
    );

    data.forEach((game) => {
      const weekKey = `Week ${game.week}`;
      if (!weeks[weekKey]) weeks[weekKey] = [];

      // Convert UTC to MST
      const mstTime = new Date(
        new Date(game.start_time).toLocaleString("en-US", {
          timeZone: "America/Denver",
        })
      );

      let status = game.status;
      if (!status) {
        if (game.home_score != null && game.away_score != null) {
          status = "Final";
          game.winner =
            game.home_score > game.away_score ? game.team_a : game.team_b;
        } else if (mstTime <= nowMST) {
          status = "InProgress";
        } else {
          status = "Scheduled";
        }
      }

      weeks[weekKey].push({
        id: game.id,
        homeTeam: game.team_a,
        awayTeam: game.team_b,
        home_score: game.home_score,
        away_score: game.away_score,
        winner: game.winner,
        status,
        date: mstTime.toISOString(), // send MST time to frontend
        week: game.week,
      });
    });

    // Sort by MST
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










