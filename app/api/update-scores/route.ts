// app/api/update-scores/route.ts
import { NextResponse } from "next/server";
import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

interface Competitor {
  homeAway: "home" | "away";
  score: string;
  team: { abbreviation: string; displayName: string };
}

interface Event {
  id: string;
  date: string;
  name: string;
  week?: { number: number } | number;
  status: { type: { state: "pre" | "in" | "post" } };
  competitions: { competitors: Competitor[] }[];
}

const teamMap: Record<string, string> = {
  WSH: "WAS",
  LAR: "LAR",
  LAC: "LAC",
};

async function getCurrentWeek(): Promise<number | null> {
  try {
    const nowMST = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Denver" }));
    
    const { data: games, error } = await supabase
      .from("games")
      .select("week, start_time")
      .order("week", { ascending: true });

    if (error) {
      console.error("Error fetching games:", error);
      return null;
    }

    const weekNumbers = Array.from(new Set(games.map(g => g.week))).sort((a, b) => a - b);
    
    const upcomingWeek = weekNumbers.find(week => {
      const weekGames = games.filter(g => g.week === week);
      return weekGames.some(game => {
        const gameTime = new Date(game.start_time);
        const mstGameTime = new Date(gameTime.getTime() - 7 * 60 * 60 * 1000);
        return mstGameTime > nowMST;
      });
    });

    const currentWeek = upcomingWeek ?? Math.max(...weekNumbers);
    
    console.log(`📅 Current week determined: ${currentWeek}`);
    return currentWeek;
  } catch (error) {
    console.error("Error determining current week:", error);
    return null;
  }
}

export async function GET() {
  try {
    console.log("📡 Fetching NFL scores for current week...");

    const currentWeek = await getCurrentWeek();
    if (!currentWeek) {
      console.warn("⚠️ Could not determine current week");
      return NextResponse.json({ message: "No current week found" }, { status: 200 });
    }

    console.log(`🔍 Checking what games exist in database for week ${currentWeek}...`);
    const { data: existingGames, error: fetchError } = await supabase
      .from("games")
      .select("id, team_a, team_b, home_score, away_score, status, winner, week")
      .eq("week", currentWeek)
      .order("start_time");

    if (fetchError) {
      console.error("❌ Error fetching existing games:", fetchError);
    } else {
      console.log(`📊 Found ${existingGames?.length || 0} games in database for week ${currentWeek}`);
    }

    console.log(`⏳ Fetching week ${currentWeek} from ESPN...`);
    const response = await axios.get<{ events: Event[] }>(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}`
    );

    const events = response.data.events || [];
    if (!events.length) {
      console.warn(`⚠️ No games found for week ${currentWeek}`);
      return NextResponse.json({ message: "No games found for current week" }, { status: 200 });
    }

    let updatedCount = 0;
    let mondayNightGameUpdated = false;

    for (const event of events) {
      const competitors = event.competitions?.[0]?.competitors || [];
      const homeTeam = competitors.find((c) => c.homeAway === "home");
      const awayTeam = competitors.find((c) => c.homeAway === "away");

      if (!homeTeam || !awayTeam) {
        console.warn("⚠️ Skipping event, missing home/away team", event.name);
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
      if (homeScore !== null && awayScore !== null && homeScore !== awayScore) {
        winner = homeScore > awayScore ? homeTeam.team.abbreviation : awayTeam.team.abbreviation;
      }

      const status =
        event.status.type.state === "pre"
          ? "Scheduled"
          : event.status.type.state === "in"
          ? "InProgress"
          : "Final";

      // Normalize team abbreviations
      const dbHomeTeam = teamMap[homeTeam.team.abbreviation] || homeTeam.team.abbreviation;
      const dbAwayTeam = teamMap[awayTeam.team.abbreviation] || awayTeam.team.abbreviation;

      console.log(
        `🎯 ESPN Game: ${awayTeam.team.abbreviation} @ ${homeTeam.team.abbreviation} | Status: ${status} | Scores: ${awayScore}-${homeScore} | Winner: ${winner}`
      );

      // Calculate total points for Monday night game
      let actualTotalPoints = null;
      const gameDate = new Date(event.date);
      const isMondayNight = gameDate.getUTCHours() >= 1 && gameDate.getUTCHours() <= 3;
      const gameDay = gameDate.getUTCDay();
      
      if ((isMondayNight && gameDay === 1) || status === "Final") {
        if (homeScore !== null && awayScore !== null) {
          actualTotalPoints = homeScore + awayScore;
          console.log(`🏈 Monday Night Total Points: ${actualTotalPoints}`);
        }
      }

      // Update Supabase
      const updateData: any = { 
        home_score: homeScore, 
        away_score: awayScore, 
        winner, 
        status 
      };

      if (actualTotalPoints !== null) {
        updateData.actual_total_points = actualTotalPoints;
        mondayNightGameUpdated = true;
      }

      // FIXED: Your database stores team_a as HOME team, team_b as AWAY team
      // ESPN returns: awayTeam @ homeTeam
      // So we need to match: team_a = homeTeam, team_b = awayTeam
      console.log(`🔄 Attempting to update: team_a='${dbHomeTeam}' (home), team_b='${dbAwayTeam}' (away), week=${currentWeek}`);
      
      // Try the update with CORRECT team order
      const { data: updateResult, error } = await supabase
        .from("games")
        .update(updateData)
        .eq("team_a", dbHomeTeam)  // team_a is HOME team in your database
        .eq("team_b", dbAwayTeam)  // team_b is AWAY team in your database  
        .eq("week", currentWeek)
        .select();

      if (error) {
        console.error(`❌ Update failed:`, error);
      } else if (updateResult && updateResult.length > 0) {
        console.log(`✅ Update succeeded: Updated ${updateResult.length} row(s)`);
        updatedCount++;
      } else {
        console.log(`❌ No rows updated - trying reverse team order...`);
        
        // Try the reverse order just in case
        const { data: reverseResult, error: reverseError } = await supabase
          .from("games")
          .update(updateData)
          .eq("team_a", dbAwayTeam)
          .eq("team_b", dbHomeTeam)
          .eq("week", currentWeek)
          .select();

        if (reverseError) {
          console.error(`❌ Reverse update also failed:`, reverseError);
        } else if (reverseResult && reverseResult.length > 0) {
          console.log(`✅ Reverse update succeeded: Updated ${reverseResult.length} row(s)`);
          updatedCount++;
        } else {
          console.log(`❌ Both update attempts failed for ${dbAwayTeam} @ ${dbHomeTeam} in week ${currentWeek}`);
        }
      }
    }

    console.log(`🎉 Successfully updated ${updatedCount} games for week ${currentWeek}`);
    if (mondayNightGameUpdated) {
      console.log("🏈 Monday night game total points updated");
    }

    return NextResponse.json({ 
      message: `Scores for week ${currentWeek} updated!`,
      updatedCount,
      mondayNightGameUpdated,
      week: currentWeek
    });
  } catch (err) {
    console.error("❌ Error updating scores:", err);
    return NextResponse.json({ error: "Failed to update scores" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}






