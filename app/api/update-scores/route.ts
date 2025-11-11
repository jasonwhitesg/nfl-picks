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
    const now = new Date();
    console.log(`🕐 Current server time: ${now.toISOString()}`);
    
    const { data: games, error } = await supabase
      .from("games")
      .select("week, start_time, status, team_a, team_b, is_monday_night")
      .order("week", { ascending: true });

    if (error) {
      console.error("Error fetching games:", error);
      return null;
    }

    if (!games || games.length === 0) {
      console.warn("⚠️ No games found in database");
      return null;
    }

    const weekNumbers = Array.from(new Set(games.map(g => g.week))).sort((a, b) => a - b);
    console.log(`📋 Available weeks in database: ${weekNumbers.join(', ')}`);
    
    // Find the current week by looking for weeks with active games
    let currentWeek = null;
    
    for (const week of weekNumbers) {
      const weekGames = games.filter(g => g.week === week);
      
      // Filter out BYE games - they shouldn't count as "active" games
      const realGames = weekGames.filter(game => 
        game.team_a.toLowerCase() !== 'bye' && game.team_b.toLowerCase() !== 'bye'
      );
      
      console.log(`🔍 Checking week ${week}: ${weekGames.length} total games, ${realGames.length} real games`);
      
      if (realGames.length === 0) {
        console.log(`   Week ${week}: SKIPPING - no real games (only BYE games)`);
        continue;
      }
      
      // Check if this week has any REAL games that are not final
      const hasActiveGames = realGames.some(game => {
        const gameTime = new Date(game.start_time);
        const gameStatus = game.status;
        
        // Game is active if:
        // 1. It's scheduled for the future, OR
        // 2. It's in progress, OR  
        // 3. It's in the past but not marked as final (recently completed)
        const isUpcoming = gameTime > now;
        const isInProgress = gameStatus === 'InProgress';
        const isCompletedButNotFinal = gameTime <= now && gameStatus !== 'Final';
        
        return isUpcoming || isInProgress || isCompletedButNotFinal;
      });
      
      // Check if all REAL games are final
      const allGamesFinal = realGames.every(game => game.status === 'Final');
      
      console.log(`   Week ${week}: hasActiveGames=${hasActiveGames}, allGamesFinal=${allGamesFinal}`);
      
      // PRIORITY: If this week has active games, it's definitely the current week
      if (hasActiveGames) {
        currentWeek = week;
        console.log(`🎯 Found active week: ${week} - has live/scheduled games`);
        break; // STOP searching - we found the current week
      }
      
      // If no active week found yet, track the most recent week with REAL games
      // but don't break - we want to keep looking for active games in higher weeks
      if (!currentWeek && realGames.length > 0) {
        currentWeek = week;
        console.log(`📌 Tracking week ${week} as potential fallback`);
      }
    }

    // If we found an active week, use it (this should be the case for week 10)
    if (currentWeek) {
      console.log(`📅 Using week ${currentWeek} as current week`);
      return currentWeek;
    }

    // Final fallback - find the highest week with REAL games
    // This should only happen if ALL games in ALL weeks are final
    if (weekNumbers.length > 0) {
      for (let i = weekNumbers.length - 1; i >= 0; i--) {
        const week = weekNumbers[i];
        const weekGames = games.filter(g => g.week === week);
        const realGames = weekGames.filter(game => 
          game.team_a.toLowerCase() !== 'bye' && game.team_b.toLowerCase() !== 'bye'
        );
        
        if (realGames.length > 0) {
          currentWeek = week;
          console.log(`🔄 Final fallback to week ${week} - has ${realGames.length} real games`);
          break;
        }
      }
    }
    
    console.log(`📅 Final current week determination: ${currentWeek}`);
    return currentWeek;
  } catch (error) {
    console.error("❌ Error determining current week:", error);
    return null;
  }
}

export async function GET() {
  try {
    console.log("📡 Starting NFL scores update...");

    const currentWeek = await getCurrentWeek();
    if (!currentWeek) {
      console.warn("⚠️ Could not determine current week");
      return NextResponse.json({ message: "No current week found" }, { status: 200 });
    }

    console.log(`🔍 Checking what games exist in database for week ${currentWeek}...`);
    const { data: existingGames, error: fetchError } = await supabase
      .from("games")
      .select("id, team_a, team_b, home_score, away_score, status, winner, week, start_time, is_monday_night")
      .eq("week", currentWeek)
      .order("start_time");

    if (fetchError) {
      console.error("❌ Error fetching existing games:", fetchError);
    } else {
      console.log(`📊 Found ${existingGames?.length || 0} games in database for week ${currentWeek}`);
      
      // Log game status summary
      const scheduledGames = existingGames?.filter(g => g.status === 'Scheduled').length || 0;
      const liveGames = existingGames?.filter(g => g.status === 'InProgress').length || 0;
      const finalGames = existingGames?.filter(g => g.status === 'Final').length || 0;
      const mondayNightGames = existingGames?.filter(g => g.is_monday_night).length || 0;
      
      console.log(`📈 Week ${currentWeek} Status: ${scheduledGames} scheduled, ${liveGames} live, ${finalGames} final, ${mondayNightGames} MNF games`);
      
      existingGames?.forEach(game => {
        const mnfIndicator = game.is_monday_night ? ' [MNF]' : '';
        console.log(`   ${game.team_b} @ ${game.team_a}: ${game.away_score}-${game.home_score} - ${game.status}${mnfIndicator}`);
      });
    }

    console.log(`⏳ Fetching week ${currentWeek} from ESPN...`);
    const response = await axios.get<{ events: Event[] }>(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${currentWeek}`
    );

    const events = response.data.events || [];
    console.log(`📋 ESPN returned ${events.length} events for week ${currentWeek}`);
    
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
        `🎯 ESPN Game: ${dbAwayTeam} @ ${dbHomeTeam} | Status: ${status} | Scores: ${awayScore}-${homeScore} | Winner: ${winner}`
      );

      // FIXED Monday night detection - Use database flag instead of ESPN data
      let actualTotalPoints = null;
      
      // Check if this game is marked as Monday Night in our database
      const isMondayNightInDB = existingGames?.some(game => 
        (game.team_a === dbHomeTeam && game.team_b === dbAwayTeam && game.is_monday_night) ||
        (game.team_a === dbAwayTeam && game.team_b === dbHomeTeam && game.is_monday_night)
      );

      console.log(`🏈 MNF Check: DB says is_monday_night=${isMondayNightInDB} for ${dbAwayTeam} @ ${dbHomeTeam}`);

      // Update Monday night total points if the game is marked as MNF in our database AND is final
      if (isMondayNightInDB && status === "Final") {
        if (homeScore !== null && awayScore !== null) {
          actualTotalPoints = homeScore + awayScore;
          console.log(`🏈 Monday Night Total Points: ${actualTotalPoints} (${homeScore} + ${awayScore})`);
        } else {
          console.log(`🏈 MNF Game is final but missing scores: ${awayScore}-${homeScore}`);
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
        console.log(`💾 Will update MNF total points: ${actualTotalPoints}`);
      }

      // First try: match exactly as ESPN provides (team_a = home, team_b = away)
      console.log(`🔄 Attempt 1: Updating team_a='${dbHomeTeam}', team_b='${dbAwayTeam}', week=${currentWeek}`);
      
      const { data: updateResult, error } = await supabase
        .from("games")
        .update(updateData)
        .eq("team_a", dbHomeTeam)
        .eq("team_b", dbAwayTeam)
        .eq("week", currentWeek)
        .select();

      if (error) {
        console.error(`❌ Update failed:`, error);
      } else if (updateResult && updateResult.length > 0) {
        console.log(`✅ Update succeeded: Updated ${updateResult.length} row(s)`);
        if (actualTotalPoints !== null) {
          console.log(`💰 MNF Total Points Updated: ${actualTotalPoints}`);
        }
        updatedCount++;
        continue; // Move to next game
      } else {
        console.log(`❌ No rows updated with team_a='${dbHomeTeam}', team_b='${dbAwayTeam}'`);
        
        // Second try: reverse the teams (team_a = away, team_b = home)
        console.log(`🔄 Attempt 2: Trying team_a='${dbAwayTeam}', team_b='${dbHomeTeam}', week=${currentWeek}`);
        
        const { data: reverseResult, error: reverseError } = await supabase
          .from("games")
          .update(updateData)
          .eq("team_a", dbAwayTeam)
          .eq("team_b", dbHomeTeam)
          .eq("week", currentWeek)
          .select();

        if (reverseError) {
          console.error(`❌ Reverse update failed:`, reverseError);
        } else if (reverseResult && reverseResult.length > 0) {
          console.log(`✅ Reverse update succeeded: Updated ${reverseResult.length} row(s)`);
          if (actualTotalPoints !== null) {
            console.log(`💰 MNF Total Points Updated: ${actualTotalPoints}`);
          }
          updatedCount++;
        } else {
          console.log(`❌ Both update attempts failed for ${dbAwayTeam} @ ${dbHomeTeam} in week ${currentWeek}`);
          
          // Third try: Check if the game exists in our database with different team order
          console.log(`🔄 Attempt 3: Searching for any game with these teams in week ${currentWeek}`);
          const { data: anyGame, error: anyError } = await supabase
            .from("games")
            .select("*")
            .eq("week", currentWeek)
            .or(`and(team_a.eq.${dbHomeTeam},team_b.eq.${dbAwayTeam}),and(team_a.eq.${dbAwayTeam},team_b.eq.${dbHomeTeam})`)
            .select();

          if (anyError) {
            console.error(`❌ Search failed:`, anyError);
          } else if (anyGame && anyGame.length > 0) {
            console.log(`🔍 Found game with ID: ${anyGame[0].id}, teams: ${anyGame[0].team_a} vs ${anyGame[0].team_b}, is_monday_night: ${anyGame[0].is_monday_night}`);
            
            // Check if this is the MNF game from database
            if (anyGame[0].is_monday_night && status === "Final" && homeScore !== null && awayScore !== null) {
              const mnfTotal = homeScore + awayScore;
              console.log(`🏈 Database MNF Game Found: ${anyGame[0].team_b} @ ${anyGame[0].team_a}, Total Points: ${mnfTotal}`);
              updateData.actual_total_points = mnfTotal;
              mondayNightGameUpdated = true;
            }
            
            // Update by ID
            const { data: idResult, error: idError } = await supabase
              .from("games")
              .update(updateData)
              .eq("id", anyGame[0].id)
              .select();

            if (idError) {
              console.error(`❌ ID-based update failed:`, idError);
            } else if (idResult && idResult.length > 0) {
              console.log(`✅ ID-based update succeeded: Updated ${idResult.length} row(s)`);
              if (updateData.actual_total_points) {
                console.log(`💰 MNF Total Points Updated: ${updateData.actual_total_points}`);
              }
              updatedCount++;
            }
          } else {
            console.log(`❌ Game not found in database at all: ${dbAwayTeam} @ ${dbHomeTeam}`);
          }
        }
      }
    }

    console.log(`🎉 Successfully updated ${updatedCount} games for week ${currentWeek}`);
    if (mondayNightGameUpdated) {
      console.log("🏈 Monday night game total points were updated");
    } else {
      console.log("❌ No Monday night game total points were updated - check if MNF game is marked in database");
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






