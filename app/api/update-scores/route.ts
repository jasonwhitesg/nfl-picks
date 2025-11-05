// pages/api/update-scores.ts
import { NextResponse } from "next/server";
import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

interface Competitor {
  homeAway: "home" | "away";
  score: string;
  team: { abbreviation: string };
}

interface Event {
  date: string;
  week?: { number: number } | number;
  status: { type: { state: "pre" | "in" | "post" } };
  competitions: { competitors: Competitor[] }[];
}

const teamMap: Record<string, string> = {
  WSH: "WAS",
  LAR: "LAR",
  LAC: "LAC",
};

export async function GET() {
  try {
    console.log("📡 Fetching NFL scores for weeks 1–9...");

    for (let weekNum = 1; weekNum <= 9; weekNum++) {
      console.log(`\n⏳ Fetching week ${weekNum}...`);
      const res = await axios.get<{ events: Event[] }>(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${weekNum}`
      );

      const events = res.data.events || [];
      if (!events.length) {
        console.warn(`⚠️ No games found for week ${weekNum}`);
        continue;
      }

      for (const event of events) {
        const competitors = event.competitions?.[0]?.competitors || [];
        const homeTeam = competitors.find((c) => c.homeAway === "home");
        const awayTeam = competitors.find((c) => c.homeAway === "away");

        if (!homeTeam || !awayTeam) {
          console.warn("⚠️ Skipping event, missing home/away team", event);
          continue;
        }

        // Safely parse scores
        const homeScore = homeTeam.score && !isNaN(Number(homeTeam.score))
          ? Number(homeTeam.score)
          : null;
        const awayScore = awayTeam.score && !isNaN(Number(awayTeam.score))
          ? Number(awayTeam.score)
          : null;

        let winner: string | null = null;
        if (homeScore !== null && awayScore !== null) {
          winner =
            homeScore > awayScore
              ? homeTeam.team.abbreviation
              : awayTeam.team.abbreviation;
        }

        const status =
          event.status.type.state === "pre"
            ? "Scheduled"
            : event.status.type.state === "in"
            ? "InProgress"
            : "Final";

        // Normalize team abbreviations to match DB
        const dbHomeTeam = teamMap[homeTeam.team.abbreviation] || homeTeam.team.abbreviation;
        const dbAwayTeam = teamMap[awayTeam.team.abbreviation] || awayTeam.team.abbreviation;

        console.log(
          `Game: ${awayTeam.team.abbreviation} @ ${homeTeam.team.abbreviation} | Status: ${status} | Scores: ${homeScore}-${awayScore} | Winner: ${winner} | Week: ${weekNum}`
        );

        // Update Supabase
        const { error } = await supabase
          .from("games")
          .update({ home_score: homeScore, away_score: awayScore, winner, status })
          .eq("team_a", dbHomeTeam)
          .eq("team_b", dbAwayTeam)
          .eq("week", weekNum);

        if (error) {
          console.error("❌ Supabase update error:", error.message, error.details);
        } else {
          console.log(`✅ Updated ${dbHomeTeam} @ ${dbAwayTeam} for week ${weekNum}`);
        }
      }
    }

    return NextResponse.json({ message: "Scores for weeks 1–9 updated!" });
  } catch (err) {
    console.error("❌ Error updating scores:", err);
    return NextResponse.json({ error: "Failed to update scores" }, { status: 500 });
  }
}






