"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLiveScores } from "@/lib/useLiveScores";
import { periodLabel } from "@/lib/espnLive";
import GameDetailSheet from "@/components/GameDetailSheet";
import { useRouter } from "next/navigation";

type Game = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  week: number;
  home_score?: number | null;
  away_score?: number | null;
  winner?: string | null;
  status?: string | null;
  is_monday_night?: boolean;
  actual_total_points?: number | null;
};

type Pick = {
  user_id: string;
  game_id: string;
  selected_team: string;
  lock_time: string;
  total_points?: number | null;
};

type Profile = {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_admin?: boolean;
};

type UserStats = {
  correctPicks: number;
  totalPicks: number;
  percentage: number;
  mondayNightPick: number | null;
  actualMondayTotal: number | null;
  mondayNightDifference: number | null;
  hasMadePicks: boolean;
};

type WinnerData = {
  season: number;
  week: number;
  player_name: string;
  correct_picks: number;
  tiebreaker: number | null;
  is_paid_winner: boolean;
  is_tied: boolean;
};

const AllPicksPage = () => {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [now, setNow] = useState(new Date());
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});
  const [bestPerformers, setBestPerformers] = useState<{
    paidMostCorrect: string[];
    unpaidMostCorrect: string[];
  }>({ 
    paidMostCorrect: [], 
    unpaidMostCorrect: []
  });
  const [sortBy, setSortBy] = useState<'percentage' | 'name'>('percentage');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingPaidStatus, setEditingPaidStatus] = useState<string | null>(null);
  const [paidStatus, setPaidStatus] = useState<Record<string, boolean>>({});
  const [updatingPaidStatus, setUpdatingPaidStatus] = useState<string | null>(null);
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);
  const [hoveredGame, setHoveredGame] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [hoveredLockIndicator, setHoveredLockIndicator] = useState<string | null>(null);
  const [userSelectedWeek, setUserSelectedWeek] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [storingWinners, setStoringWinners] = useState(false);
  const [updatingScores, setUpdatingScores] = useState(false);
  const [scoreRefreshVersion, setScoreRefreshVersion] = useState(0);
  const [gamesByWeek, setGamesByWeek] = useState<Record<number, Game[]>>({});

  // ADDED: State for fixed week data (all weeks)
  const [fixedWeekData, setFixedWeekData] = useState<{
    users: Profile[];
    picksByUser: Record<string, Pick[]>;
    games: Game[];
  }>({
    users: [],
    picksByUser: {},
    games: []
  });

  const [seasonYear, setSeasonYear] = useState(2026);

  // Update now every second for real-time countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Find the earliest Sunday game at or after 2:00 PM (14:00) for the current week
  const getWeekLockTimeForCurrentWeek = (): Date | null => {
    if (!activeWeek) return null;
    
    const weekGames = gamesByWeek[activeWeek] || [];
    
    // Only consider SUNDAY games
    const sundayGames = weekGames.filter(game => {
      const gameTime = new Date(game.startTime);
      const dayOfWeek = gameTime.getDay(); // 0 = Sunday
      return dayOfWeek === 0; // Only Sunday games
    });
    
    if (sundayGames.length === 0) {
      return null;
    }
    
    // Find Sunday games at or after 2:00 PM (14:00 hours)
    const afternoonSundayGames = sundayGames.filter(game => {
      const gameTime = new Date(game.startTime);
      const hours = gameTime.getHours();
      // 14:00 = 2:00 PM
      return hours >= 14; // At or after 2:00 PM
    });
    
    if (afternoonSundayGames.length === 0) {
      return null; // No afternoon games this week
    }
    
    // Sort by time to find the earliest afternoon game
    const sortedAfternoonGames = afternoonSundayGames.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    
    // Return the time of the earliest Sunday game at/after 2:00 PM
    return new Date(sortedAfternoonGames[0].startTime);
  };

  // Lock logic with week-specific rules (UPDATED TO MATCH MAKEPICKSPAGE)
  const isLocked = (isoDate: string) => {
    const gameTime = new Date(isoDate);
    
    // Individual game lock: game starts at its own time
    const individualGameLocked = now.getTime() >= gameTime.getTime();
    
    // Check what day of the week the game is on
    const dayOfWeek = gameTime.getDay(); 
    // 0 = Sunday, 1 = Monday, 4 = Thursday, 5 = Friday, 6 = Saturday
    
    // Thursday, Friday, Saturday games lock individually
    if (dayOfWeek === 4 || dayOfWeek === 5 || dayOfWeek === 6) {
      return individualGameLocked;
    }
    
    // For Sunday AND Monday games, check if 2 PM rule applies
    if (dayOfWeek === 0 || dayOfWeek === 1) {
      const weekLockTime = getWeekLockTimeForCurrentWeek();
      
      // If no Sunday games at/after 2:00 PM this week, lock individually
      if (!weekLockTime) {
        return individualGameLocked;
      }
      
      // Check if week lock has already occurred (DEN @ LV has started)
      const weekLocked = now.getTime() >= weekLockTime.getTime();
      
      // For Sunday games
      if (dayOfWeek === 0) {
        const gameStartsAt2PMOrLater = gameTime.getHours() >= 14;
        
        if (gameStartsAt2PMOrLater) {
          // Sunday games at or after 2:00 PM: lock when earliest 2:00 PM game starts
          return individualGameLocked || weekLocked;
        } else {
          // Sunday games before 2:00 PM: lock individually
          return individualGameLocked;
        }
      }
      
      // For Monday games: they lock when the earliest Sunday 2:00 PM game starts
      if (dayOfWeek === 1) {
        return individualGameLocked || weekLocked;
      }
    }
    
    return individualGameLocked;
  };

  // Get countdown to lock time (UPDATED TO MATCH MAKEPICKSPAGE)
  const getCountdown = (iso: string) => {
    const gameTime = new Date(iso);
    const weekLockTime = getWeekLockTimeForCurrentWeek();
    const dayOfWeek = gameTime.getDay();
    
    let lockTime = gameTime;
    
    // Use week lock time for:
    // 1. Sunday games at/after 2:00 PM
    // 2. Monday games (if there are Sunday 2:00 PM games)
    if (weekLockTime) {
      if (dayOfWeek === 0 && gameTime.getHours() >= 14) {
        // Sunday games at/after 2:00 PM use week lock
        lockTime = weekLockTime;
      } else if (dayOfWeek === 1) {
        // Monday games use week lock
        lockTime = weekLockTime;
      }
    }
    
    const diff = lockTime.getTime() - now.getTime();
    
    if (diff <= 0) {
      return "Game started";
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    
    return `${hours}h ${mins}m ${secs}s`;
  };

  // Get detailed lock message (UPDATED TO MATCH MAKEPICKSPAGE)
  const getLockMessage = (gameTime: Date, gameId: string) => {
    const dayOfWeek = gameTime.getDay();
    const weekLockTime = getWeekLockTimeForCurrentWeek();
    
    // First check if week is already locked
    if (weekLockTime && now.getTime() >= weekLockTime.getTime()) {
      // Week is locked - all Sunday 2:00 PM+ and Monday games are locked
      if ((dayOfWeek === 0 && gameTime.getHours() >= 14) || dayOfWeek === 1) {
        return "⏰ Week locked - all picks locked";
      }
    }
    
    // Thursday, Friday, Saturday games always lock individually
    if (dayOfWeek === 4 || dayOfWeek === 5 || dayOfWeek === 6) {
      const diff = gameTime.getTime() - now.getTime();
      if (diff <= 0) {
        return "⏰ Game locked";
      }
      return `⏰ Locks in: ${getCountdown(gameTime.toISOString())}`;
    }
    
    // Sunday games
    if (dayOfWeek === 0) {
      if (weekLockTime && gameTime.getHours() >= 14) {
        const diff = weekLockTime.getTime() - now.getTime();
        if (diff <= 0) {
          return "⏰ Week locked - all picks locked";
        }
        // Find the earliest Sunday 2:00 PM game for the message
        const earliestAfternoonGame = gamesByWeek[activeWeek || 0]
          ?.filter(game => {
            const gt = new Date(game.startTime);
            return gt.getDay() === 0 && gt.getHours() >= 14;
          })
          ?.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
        
        if (earliestAfternoonGame) {
          return `⏰ Locks when ${earliestAfternoonGame.awayTeam} @ ${earliestAfternoonGame.homeTeam} starts: ${getCountdown(gameTime.toISOString())}`;
        }
        return `⏰ Locks when earliest Sunday 2 PM game starts: ${getCountdown(gameTime.toISOString())}`;
      } else {
        const diff = gameTime.getTime() - now.getTime();
        if (diff <= 0) {
          return "⏰ Game locked";
        }
        return `⏰ Locks in: ${getCountdown(gameTime.toISOString())}`;
      }
    }
    
    // Monday games
    if (dayOfWeek === 1) {
      if (weekLockTime) {
        const diff = weekLockTime.getTime() - now.getTime();
        if (diff <= 0) {
          return "⏰ Week locked - all picks locked";
        }
        // Find the earliest Sunday 2:00 PM game for the message
        const earliestAfternoonGame = gamesByWeek[activeWeek || 0]
          ?.filter(game => {
            const gt = new Date(game.startTime);
            return gt.getDay() === 0 && gt.getHours() >= 14;
          })
          ?.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
        
        if (earliestAfternoonGame) {
          return `⏰ Locks when ${earliestAfternoonGame.awayTeam} @ ${earliestAfternoonGame.homeTeam} starts: ${getCountdown(gameTime.toISOString())}`;
        }
        return `⏰ Locks when earliest Sunday 2 PM game starts: ${getCountdown(gameTime.toISOString())}`;
      } else {
        // If no Sunday 2:00 PM game in this week, lock individually
        const diff = gameTime.getTime() - now.getTime();
        if (diff <= 0) {
          return "⏰ Game locked";
        }
        return `⏰ Locks in: ${getCountdown(gameTime.toISOString())}`;
      }
    }
    
    // Default fallback
    const diff = gameTime.getTime() - now.getTime();
    if (diff <= 0) {
      return "⏰ Game locked";
    }
    return `⏰ Locks in: ${getCountdown(gameTime.toISOString())}`;
  };

  // Check if week is complete (all games are final)
  const isWeekComplete = (): boolean => {
    if (!activeWeek) return false;
    const weekGames = gamesByWeek[activeWeek] || [];
    return weekGames.length > 0 && weekGames.every(g => g.status === "Final");
  };

  // Function to check stored winners
  const checkStoredWinners = async (week: number) => {
    if (!isAdmin) return;
    
    try {
      const { data: existingWinners, error } = await supabase
        .from('weekly_winners')
        .select('*')
        .eq('season', seasonYear)
        .eq('week', week)
        .order('is_paid_winner', { ascending: false });

      if (error) {
        console.error('Error checking stored winners:', error);
        alert('Error checking stored winners');
        return;
      }

      if (existingWinners && existingWinners.length > 0) {
        const paidWinners = existingWinners.filter(w => w.is_paid_winner);
        const unpaidWinners = existingWinners.filter(w => !w.is_paid_winner);
        
        let message = `Stored Winners for Week ${week}:\n\n`;
        
        if (paidWinners.length > 0) {
          message += "🏆 PAID WINNERS:\n";
          paidWinners.forEach((winner, index) => {
            message += `${index + 1}. ${winner.player_name} - ${winner.correct_picks} correct`;
            if (winner.tiebreaker !== null) message += ` (MNF diff: ${winner.tiebreaker})`;
            if (winner.is_tied) message += ` [TIED]`;
            message += '\n';
          });
          message += '\n';
        }
        
        if (unpaidWinners.length > 0) {
          message += "🥈 UNPAID WINNERS (Would Have Won):\n";
          unpaidWinners.forEach((winner, index) => {
            message += `${index + 1}. ${winner.player_name} - ${winner.correct_picks} correct`;
            if (winner.tiebreaker !== null) message += ` (MNF diff: ${winner.tiebreaker})`;
            if (winner.is_tied) message += ` [TIED]`;
            message += '\n';
          });
        }
        
        if (paidWinners.length === 0 && unpaidWinners.length === 0) {
          message = `No winners stored for Week ${week}`;
        }
        
        alert(message);
      } else {
        alert(`No winners stored for Week ${week}`);
      }
    } catch (err) {
      console.error('Error checking stored winners:', err);
      alert('Error checking stored winners');
    }
  };

  // FIXED: Store weekly winners with proper validation
  const storeWeeklyWinners = async (week: number) => {
    try {
      setStoringWinners(true);
      console.log(`🏆 Storing winners for Week ${week}...`);
      
      const paidWinners = bestPerformers.paidMostCorrect;
      const unpaidWinners = bestPerformers.unpaidMostCorrect;
      
      console.log(`💰 Paid winners for Week ${week}:`, paidWinners);
      console.log(`🚫 Unpaid winners for Week ${week}:`, unpaidWinners);
      
      // VALIDATION: Only store if there are actual winners
      if (paidWinners.length === 0 && unpaidWinners.length === 0) {
        console.log('❌ No winners found for this week');
        return { success: false, message: 'No winners found' };
      }

      // Check if winners already exist
      const { data: existingWinners, error: checkError } = await supabase
        .from('weekly_winners')
        .select('*')
        .eq('season', seasonYear)
        .eq('week', week);

      if (checkError) {
        console.error('Error checking existing winners:', checkError);
        return { success: false, error: checkError };
      }

      if (existingWinners && existingWinners.length > 0) {
        console.log('✅ Winners already stored for Week', week);
        return { 
          success: false, 
          message: 'Winners already stored', 
          existingWinners 
        };
      }

      // Prepare winners data
      const winnersData: WinnerData[] = [];
      
      // Store paid winners
      paidWinners.forEach(userId => {
        const userProfile = profiles.find(p => p.user_id === userId);
        const stats = userStats[userId];
        
        if (userProfile && stats) {
          winnersData.push({
            season: seasonYear,
            week: week,
            player_name: userProfile.username,
            correct_picks: stats.correctPicks,
            tiebreaker: stats.mondayNightDifference,
            is_paid_winner: true,
            is_tied: paidWinners.length > 1
          });
          console.log(`💰 Storing paid winner: ${userProfile.username} (${stats.correctPicks} correct)`);
        }
      });
      
      // Store unpaid winners (only if they actually won by beating paid winner)
      unpaidWinners.forEach(userId => {
        const userProfile = profiles.find(p => p.user_id === userId);
        const stats = userStats[userId];
        
        if (userProfile && stats) {
          winnersData.push({
            season: seasonYear,
            week: week,
            player_name: userProfile.username,
            correct_picks: stats.correctPicks,
            tiebreaker: stats.mondayNightDifference,
            is_paid_winner: false,
            is_tied: unpaidWinners.length > 1
          });
          console.log(`🚫 Storing unpaid winner: ${userProfile.username} (${stats.correctPicks} correct - BEAT paid winner)`);
        }
      });

      if (winnersData.length === 0) {
        console.log('❌ No valid winners to store');
        return { success: false, message: 'No valid winners after validation' };
      }

      console.log(`📊 Storing ${winnersData.length} winners for Week ${week}`);
      
      // Store in database
      const { data, error } = await supabase
        .from('weekly_winners')
        .insert(winnersData)
        .select();

      if (error) {
        console.error('❌ Error storing weekly winners:', error);
        return { success: false, error };
      }

      console.log(`✅ Successfully stored winners for Week ${week}`);
      return { success: true, data };
    } catch (err) {
      console.error('❌ Error in storeWeeklyWinners:', err);
      return { success: false, error: err };
    } finally {
      setStoringWinners(false);
    }
  };

  // ADD: Cleanup function to remove incorrect winners
  const cleanupIncorrectWinners = async () => {
    try {
      console.log('🧹 Cleaning up incorrect winners...');
      
      const { data: allWinners, error: fetchError } = await supabase
        .from('weekly_winners')
        .select('*')
        .eq('season', seasonYear);

      if (fetchError) {
        console.error('Error fetching winners for cleanup:', fetchError);
        return;
      }

      if (!allWinners) return;

      const weeksToDelete: number[] = [];
      
      for (const winner of allWinners) {
        const weekGames = games.filter(game => game.week === winner.week);
        const playersWithPicks = profiles.filter(profile => {
          const userPicks = picks.filter(pick => pick.user_id === profile.user_id);
          const picksForWeek = userPicks.filter(pick => 
            weekGames.some(game => game.id === pick.game_id)
          );
          return picksForWeek.length > 0;
        }).length;

        if (playersWithPicks === 0) {
          weeksToDelete.push(winner.week);
        }
      }

      const uniqueWeeksToDelete = [...new Set(weeksToDelete)];
      
      if (uniqueWeeksToDelete.length > 0) {
        console.log(`🗑️ Deleting winners for weeks with no players:`, uniqueWeeksToDelete);
        
        const { error: deleteError } = await supabase
          .from('weekly_winners')
          .delete()
          .in('week', uniqueWeeksToDelete);

        if (deleteError) {
          console.error('Error deleting incorrect winners:', deleteError);
        } else {
          console.log('✅ Successfully cleaned up incorrect winners');
        }
      } else {
        console.log('✅ No incorrect winners found');
      }
    } catch (err) {
      console.error('Error in cleanup:', err);
    }
  };

  // ADDED: Get direct Week 18 data from database to fix the mismatch
  const fetchDirectWeekData = async (week: number) => {
    try {
      console.log('📊 Fetching direct Week 18 data from database...');
      
      // Get all Week 18 games
      const { data: week18GamesData, error: gamesError } = await supabase
        .from('games')
        .select('*')
        .eq('season', seasonYear)
        .eq('week', week)

      if (gamesError) throw gamesError;

      // Map games to our format
      const mappedWeek18Games: Game[] = (week18GamesData || []).map((g: any) => {
        const utcDate = new Date(g.start_time);

        return {
          id: g.id,
          week: g.week,
          startTime: g.start_time,
          homeTeam: g.team_a,
          awayTeam: g.team_b,
          home_score: g.home_score,
          away_score: g.away_score,
          winner: g.winner,
          status: g.status,
          is_monday_night: g.is_monday_night,
          actual_total_points: g.actual_total_points,
        };
      }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      // Get all Week 18 picks with game and profile info using a single query with joins
      const { data: week18PicksData, error: picksError } = await supabase
        .from('game_picks')
        .select(`
          *,
          games!inner(week, season, team_a, team_b),
          profiles!inner(username, user_id, first_name, last_name, email, is_admin)
        `)
        .eq('games.season', seasonYear)
        .eq('games.week', week);

      if (picksError) throw picksError;

      // Group picks by user
      const picksByUser: Record<string, Pick[]> = {};
      const week18Users: Profile[] = [];
      const userProfilesMap: Record<string, Profile> = {};

      week18PicksData?.forEach((pick: any) => {
        const userId = pick.profiles.user_id;
        
        // Store user profile if not already stored
        if (!userProfilesMap[userId]) {
          userProfilesMap[userId] = {
            user_id: pick.profiles.user_id,
            username: pick.profiles.username,
            first_name: pick.profiles.first_name,
            last_name: pick.profiles.last_name,
            email: pick.profiles.email,
            is_admin: pick.profiles.is_admin
          };
          week18Users.push(userProfilesMap[userId]);
        }
        
        // Add pick to user's picks
        if (!picksByUser[userId]) {
          picksByUser[userId] = [];
        }
        
        picksByUser[userId].push({
          user_id: pick.user_id,
          game_id: pick.game_id,
          selected_team: pick.selected_team,
          lock_time: pick.lock_time,
          total_points: pick.total_points
        });
      });

      console.log(`✅ Fetched direct Week 18 data: ${week18Users.length} users, ${mappedWeek18Games.length} games`);
      console.log(`👥 Week 18 users with picks:`, week18Users.map(u => u.username));

      setFixedWeekData({
        users: week18Users,
        picksByUser,
        games: mappedWeek18Games
      });

    } catch (err) {
      console.error('Error fetching direct Week 18 data:', err);
    }
  };

  // FIXED: Check and store winners for ALL weeks when their MNF game goes final
  useEffect(() => {
    const checkAndStoreWinnersForAllWeeks = async () => {
      if (games.length === 0 || picks.length === 0 || profiles.length === 0) return;

      console.log(`🔍 Checking ALL weeks for MNF final status...`);

      // Get all weeks that have games
      const allWeeks = Array.from(new Set(games.map(game => game.week))).sort((a, b) => a - b);
      
      for (const week of allWeeks) {
        // Find Monday Night Football game for this week
        const mondayNightGame = games.find(game => 
          game.week === week && game.is_monday_night
        );

        if (!mondayNightGame) {
          console.log(`❌ No Monday Night Football game found for Week ${week}`);
          continue;
        }

        console.log(`📊 Week ${week} MNF: ${mondayNightGame.awayTeam} @ ${mondayNightGame.homeTeam}, Status: ${mondayNightGame.status}`);

        // Check if MNF game is final for this week
        if (mondayNightGame.status === "Final") {
          console.log(`🎯 MNF game is FINAL for Week ${week}, checking if winners need to be stored...`);
          
          // Check if winners already exist in database for THIS WEEK
          const { data: existingWinners, error } = await supabase
            .from('weekly_winners')
            .select('*')
            .eq('season', seasonYear)
            .eq('week', week);

          if (error) {
            console.error('Error checking existing winners:', error);
            continue;
          }

          // Only store winners if they haven't been stored yet FOR THIS WEEK
          if (!existingWinners || existingWinners.length === 0) {
            console.log(`🏆 No existing winners found for Week ${week}, checking if we have winner data...`);
            
            // Check if we have calculated winners for this week
            const weekGames = games.filter(game => game.week === week);
            const playersWithPicks = profiles.filter(profile => {
              const userPicks = picks.filter(pick => pick.user_id === profile.user_id);
              const picksForWeek = userPicks.filter(pick => 
                weekGames.some(game => game.id === pick.game_id)
              );
              return picksForWeek.length > 0;
            });

            if (playersWithPicks.length === 0) {
              console.log(`❌ No players made picks for Week ${week}, skipping winner storage`);
              continue;
            }

            console.log(`📊 Calculating winners for Week ${week}...`);
            
            // Calculate winners for this specific week
            const { paidWinners, unpaidWinners } = await calculateWinnersForWeek(week);
            
            if (paidWinners.length > 0 || unpaidWinners.length > 0) {
              console.log(`🏆 Found winners for Week ${week}: Paid: ${paidWinners.length}, Unpaid: ${unpaidWinners.length}`);
              await storeWeeklyWinners(week);
            } else {
              console.log(`❌ No valid winners found for Week ${week}`);
            }
          } else {
            console.log(`✅ Winners already stored for Week ${week}:`, existingWinners.map(w => `${w.player_name} (${w.is_paid_winner ? 'Paid' : 'Unpaid'})`));
          }
        } else {
          console.log(`⏳ MNF game for Week ${week} is not final yet: ${mondayNightGame.status}`);
        }
      }
    };

    // Only run when we have all data loaded
    if (games.length > 0 && picks.length > 0 && profiles.length > 0) {
      checkAndStoreWinnersForAllWeeks();
    }
  }, [games, picks, profiles]);

  // Function to calculate winners for a specific week
  const calculateWinnersForWeek = async (week: number) => {
    const stats: Record<string, UserStats> = {};
    const playersWithPicks: string[] = [];
    
    // Calculate stats for this week
    profiles.forEach(profile => {
      const userPicks = picks.filter(pick => pick.user_id === profile.user_id);
      const weekGames = games.filter(game => game.week === week);
      
      const picksForThisWeek = userPicks.filter(pick => 
        weekGames.some(game => game.id === pick.game_id)
      );
      
      const hasMadePicks = picksForThisWeek.length > 0;
      
      if (hasMadePicks) {
        playersWithPicks.push(profile.user_id);
      }

      const totalGamesInWeek = weekGames.length;
      
      let correctPicks = 0;
      weekGames.forEach(game => {
        const userPick = userPicks.find(p => p.game_id === game.id);
        if (userPick && game.status === "Final" && game.winner !== null && userPick.selected_team === game.winner) {
          correctPicks++;
        }
      });

      const percentage = totalGamesInWeek > 0 ? Math.round((correctPicks / totalGamesInWeek) * 100) : 0;

      const mondayNightGame = weekGames.find(game => game.is_monday_night);
      const mondayNightPickValue = userPicks.find(p => p.game_id === mondayNightGame?.id)?.total_points;
      const actualMondayTotalValue = mondayNightGame?.actual_total_points;
      
      const mondayNightPick = mondayNightPickValue !== undefined ? mondayNightPickValue : null;
      const actualMondayTotal = actualMondayTotalValue !== undefined ? actualMondayTotalValue : null;
      
      let mondayNightDifference = null;
      if (mondayNightPick !== null && actualMondayTotal !== null) {
        mondayNightDifference = Math.abs(mondayNightPick - actualMondayTotal);
      }

      stats[profile.user_id] = {
        correctPicks,
        totalPicks: totalGamesInWeek,
        percentage,
        mondayNightPick,
        actualMondayTotal,
        mondayNightDifference,
        hasMadePicks
      };
    });

    // If no players made picks for this week, no winners
    if (playersWithPicks.length === 0) {
      return { paidWinners: [], unpaidWinners: [] };
    }

    // Get paid status for this week
    const paidStatusForWeek: Record<string, boolean> = {};
    const { data: paidData } = await supabase
      .from('weekly_payments')
      .select('user_id, is_paid')
      .eq('week_number', week)
      .eq("seasonYear", seasonYear)

    paidData?.forEach(payment => {
      paidStatusForWeek[payment.user_id] = payment.is_paid || false;
    });

    profiles.forEach(profile => {
      if (!(profile.user_id in paidStatusForWeek)) {
        paidStatusForWeek[profile.user_id] = false;
      }
    });

    // Separate players by paid status
    const paidPlayers = playersWithPicks.filter(userId => paidStatusForWeek[userId] || false);
    const unpaidPlayers = playersWithPicks.filter(userId => !paidStatusForWeek[userId]);
    
    console.log(`💰 Week ${week} - Paid players:`, paidPlayers);
    console.log(`🚫 Week ${week} - Unpaid players:`, unpaidPlayers);

    // Find PAID winner(s)
    let maxCorrectPaid = 0;
    let paidWinners: string[] = [];
    
    if (paidPlayers.length > 0) {
      paidPlayers.forEach(userId => {
        const userStat = stats[userId];
        if (userStat.correctPicks > maxCorrectPaid) {
          maxCorrectPaid = userStat.correctPicks;
        }
      });
      
      const paidPlayersWithMax = paidPlayers.filter(userId => 
        stats[userId].correctPicks === maxCorrectPaid
      );
      
      if (paidPlayersWithMax.length === 1) {
        paidWinners = paidPlayersWithMax;
      } else if (paidPlayersWithMax.length > 1) {
        let bestMNFDifference = Infinity;
        paidPlayersWithMax.forEach(userId => {
          const userStat = stats[userId];
          if (userStat.mondayNightDifference !== null && userStat.mondayNightDifference < bestMNFDifference) {
            bestMNFDifference = userStat.mondayNightDifference;
          }
        });
        
        paidPlayersWithMax.forEach(userId => {
          const userStat = stats[userId];
          if (userStat.mondayNightDifference === bestMNFDifference) {
            paidWinners.push(userId);
          }
        });
      }
    }

    // Find UNPAID winner(s) - ONLY if they BEAT the paid winner's score
    let unpaidWinners: string[] = [];
    
    if (unpaidPlayers.length > 0 && maxCorrectPaid > 0) {
      let maxCorrectUnpaid = 0;
      unpaidPlayers.forEach(userId => {
        const userStat = stats[userId];
        if (userStat.correctPicks > maxCorrectUnpaid) {
          maxCorrectUnpaid = userStat.correctPicks;
        }
      });
      
      // UNPAID player only wins if they have MORE correct picks than the paid winner
      if (maxCorrectUnpaid > maxCorrectPaid) {
        const unpaidPlayersWithMax = unpaidPlayers.filter(userId => 
          stats[userId].correctPicks === maxCorrectUnpaid
        );
        
        if (unpaidPlayersWithMax.length === 1) {
          unpaidWinners = unpaidPlayersWithMax;
        } else if (unpaidPlayersWithMax.length > 1) {
          let bestMNFDifference = Infinity;
          unpaidPlayersWithMax.forEach(userId => {
            const userStat = stats[userId];
            if (userStat.mondayNightDifference !== null && userStat.mondayNightDifference < bestMNFDifference) {
              bestMNFDifference = userStat.mondayNightDifference;
            }
          });
          
          unpaidPlayersWithMax.forEach(userId => {
            const userStat = stats[userId];
            if (userStat.mondayNightDifference === bestMNFDifference) {
              unpaidWinners.push(userId);
            }
          });
        }
      }
    }

    console.log(`✅ CALCULATED for Week ${week}: Paid: ${paidWinners.length}, Unpaid: ${unpaidWinners.length}`);
    return { paidWinners, unpaidWinners };
  };

  // Add this function to debug week detection
  const debugWeekDetection = async () => {
    console.log("🔍 DEBUG WEEK DETECTION:");
    console.log("Active Week:", activeWeek);
    
    const mnfGames = games.filter(game => game.is_monday_night);
    console.log("All MNF Games:", mnfGames.map(g => `Week ${g.week}: ${g.awayTeam} @ ${g.homeTeam} - ${g.status}`));
    
    if (activeWeek) {
      const currentMNF = games.find(game => game.week === activeWeek && game.is_monday_night);
      console.log(`Current Week ${activeWeek} MNF:`, currentMNF);
    }
    
    const { data: allWinners } = await supabase
      .from('weekly_winners')
      .select('*')
      .eq('season', seasonYear)
      .order('week');
    
    console.log("Existing winners in DB:", allWinners);
  };

  // Get current time in MST
  function getNowMST(): Date {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Denver" })
    );
  }

  // ADD: Enhanced debug function to see why week detection is working the way it is
  const debugCurrentWeek = () => {
    console.log("🔍 DEBUG CURRENT WEEK DETECTION:");
    console.log("Current time (MST):", getNowMST());
    
    const weekNumbers = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b);
    console.log("All weeks:", weekNumbers);
    
    weekNumbers.forEach(week => {
      const weekGames = games.filter(g => g.week === week);
      const nowMST = getNowMST();
      
      const hasUpcomingGames = weekGames.some(game => new Date(game.startTime) > nowMST);
      const hasLiveGames = weekGames.some(game => game.status === "InProgress");
      const allGamesFinal = weekGames.every(game => game.status === "Final");
      const gameTimes = weekGames.map(g => `${g.awayTeam} @ ${g.homeTeam} - ${new Date(g.startTime).toLocaleString()} (${g.status})`);
      
      console.log(`Week ${week}:`);
      console.log(`  - Upcoming games: ${hasUpcomingGames}`);
      console.log(`  - Live games: ${hasLiveGames}`);
      console.log(`  - All final: ${allGamesFinal}`);
      console.log(`  - Games:`, gameTimes);
    });
    
    console.log("Current active week:", activeWeek);
  };

  // Fetch paid status from weekly_payments table
  const fetchPaidStatus = async () => {
    try {
      if (!activeWeek) return;
      
      const { data: paidData, error } = await supabase
        .from('weekly_payments')
        .select('user_id, is_paid')
        .eq('week_number', activeWeek)
        .eq('season_year', seasonYear);

      if (error) {
        console.error('Error fetching paid status:', error);
        return;
      }

      const paidStatusRecord: Record<string, boolean> = {};
      paidData?.forEach(payment => {
        paidStatusRecord[payment.user_id] = payment.is_paid || false;
      });

      profiles.forEach(profile => {
        if (!(profile.user_id in paidStatusRecord)) {
          paidStatusRecord[profile.user_id] = false;
        }
      });

      setPaidStatus(paidStatusRecord);
    } catch (err) {
      console.error('Error fetching paid status:', err);
    }
  };

  // Toggle paid status and save to weekly_payments table
  const togglePaidStatus = async (userId: string) => {
    if (!isAdmin || !activeWeek) return;
    
    try {
      setUpdatingPaidStatus(userId);
      const currentStatus = paidStatus[userId] || false;
      const newStatus = !currentStatus;

      const { error } = await supabase
        .from('weekly_payments')
        .upsert({
          user_id: userId,
          week_number: activeWeek,
          season_year: seasonYear,
          is_paid: newStatus,
          paid_at: newStatus ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,week_number,season_year'
        });

      if (error) throw error;

      setPaidStatus(prev => ({
        ...prev,
        [userId]: newStatus
      }));
      
      setEditingPaidStatus(null);
    } catch (err) {
      console.error('Error updating paid status:', err);
    } finally {
      setUpdatingPaidStatus(null);
    }
  };

  // FIXED: Fetch all data with CORRECT week detection
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current user

        // Get current season from config
        const { data: config } = await supabase
          .from("season_config")
          .select("season_year")
          .single();

        const activeSeason = config?.season_year ?? 2026;

        setSeasonYear(activeSeason);

        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);
        setUserEmail(user?.email || null);

        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id, username, first_name, last_name, email, is_admin");
        setProfiles(profileData || []);

        if (user) {
          const currentUserProfile = profileData?.find(p => p.user_id === user.id);
          setIsAdmin(currentUserProfile?.is_admin || false);
        }

        const { data: gameData } = await supabase
          .from("games")
          .select("*")
          .eq("season", activeSeason);
                
        const filteredGameData = (gameData || []).filter((g: any) => 
          g.team_a && g.team_b && 
          g.team_a.trim() !== '' && g.team_b.trim() !== '' &&
          g.team_a.toLowerCase() !== 'bye' && g.team_b.toLowerCase() !== 'bye'
        );

        const mappedGames: Game[] = filteredGameData.map((g: any) => {
          const utcDate = new Date(g.start_time);

          return {
            id: g.id,
            week: g.week,
            startTime: g.start_time,
            homeTeam: g.team_a,
            awayTeam: g.team_b,
            home_score: g.home_score,
            away_score: g.away_score,
            winner: g.winner,
            status: g.status,
            is_monday_night: g.is_monday_night,
            actual_total_points: g.actual_total_points,
          };
        });
        
        const sortedGames = mappedGames.sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        setGames(sortedGames);

        // Build gamesByWeek
        const gamesByWeekMap: Record<number, Game[]> = {};
        sortedGames.forEach((g) => {
          if (!gamesByWeekMap[g.week]) gamesByWeekMap[g.week] = [];
          gamesByWeekMap[g.week].push(g);
        });
        setGamesByWeek(gamesByWeekMap);

        const { data: pickData } = await supabase.from("game_picks").select("*");
        setPicks(pickData || []);

        // Use kickoff times so stale game statuses cannot hold the page on an old week.
        if (!userSelectedWeek) {
          const weeks = Array.from(new Set(sortedGames.map(g => g.week))).sort((a, b) => a - b);
          const currentWeek = weeks.find(week =>
            sortedGames.some(game => game.week === week && new Date(game.startTime).getTime() > Date.now())
          ) ?? weeks[weeks.length - 1] ?? 1;
          setActiveWeek(currentWeek);
        }

        setLoading(false);
      } catch (err) {
        console.error("Error loading All Picks:", err);
        setLoading(false);
      }
    };

    fetchData();
    // Read newly stored ESPN scores while this page remains open.
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [userSelectedWeek, scoreRefreshVersion]);

  // DISABLED: cleanupIncorrectWinners() could delete saved weekly winners.
  // It reads picks without a season filter and Supabase caps results at 1,000
  // rows, so 2026 picks get cut off and real winners look "wrong". Its delete
  // also has no season filter. Do not re-enable.
  // useEffect(() => {
  //   if (games.length > 0 && profiles.length > 0 && picks.length > 0) {
  //     cleanupIncorrectWinners();
  //   }
  // }, [games, profiles, picks]);

  // Refetch paid status when active week changes
  useEffect(() => {
    if (activeWeek && profiles.length > 0) {
      fetchPaidStatus();
    }
  }, [activeWeek, profiles]);

  useEffect(() => {
    if (activeWeek) {
      fetchDirectWeekData(activeWeek);
    }
  }, [activeWeek]);

  // FIXED: Calculate user stats and best performers for ACTIVE WEEK only
  useEffect(() => {
    if (games.length === 0 || picks.length === 0 || profiles.length === 0 || !activeWeek) return;

    const stats: Record<string, UserStats> = {};
    const playersWithPicks: string[] = [];
    
    // Use fixed Week 18 data if available, otherwise use regular data
    let weekGames: Game[] = [];
    let userPicksMap: Record<string, Pick[]> = {};
    let weekProfiles: Profile[] = [];

    if (fixedWeekData.users.length > 0) {
      // Use FIXED Week 18 data
      weekGames = fixedWeekData.games;
      userPicksMap = fixedWeekData.picksByUser;
      weekProfiles = fixedWeekData.users;
    } else {
      // Use regular data for other weeks
      weekGames = gamesByWeek[activeWeek] || [];
      weekProfiles = profiles;
      
      // Build user picks map for regular weeks
      profiles.forEach(profile => {
        userPicksMap[profile.user_id] = picks.filter(pick => pick.user_id === profile.user_id);
      });
    }
    
    weekProfiles.forEach(profile => {
      const userPicks = userPicksMap[profile.user_id] || [];
      
      // For Week 18 with fixed data, we know they have picks
      // For other weeks, check if they have picks
      let hasMadePicks = false;
      if (fixedWeekData.users.some(u => u.user_id === profile.user_id)) {
        hasMadePicks = true;
        playersWithPicks.push(profile.user_id);
      } else {
        // For non-Week 18, use regular logic
        const weekPicks = userPicks.filter(pick => 
          weekGames.some(game => game.id === pick.game_id)
        );
        hasMadePicks = weekPicks.length > 0;
        if (hasMadePicks) {
          playersWithPicks.push(profile.user_id);
        }
      }

      const totalGamesInWeek = weekGames.length;
      
      let correctPicks = 0;
      weekGames.forEach(game => {
        const userPick = userPicks.find(p => p.game_id === game.id);
        if (userPick && game.status === "Final" && game.winner !== null && userPick.selected_team === game.winner) {
          correctPicks++;
        }
      });

      const percentage = totalGamesInWeek > 0 ? Math.round((correctPicks / totalGamesInWeek) * 100) : 0;

      const mondayNightGame = weekGames.find(game => game.is_monday_night);
      const mondayNightPickValue = userPicks.find(p => p.game_id === mondayNightGame?.id)?.total_points;
      const actualMondayTotalValue = mondayNightGame?.actual_total_points;
      
      const mondayNightPick = mondayNightPickValue !== undefined ? mondayNightPickValue : null;
      const actualMondayTotal = actualMondayTotalValue !== undefined ? actualMondayTotalValue : null;
      
      let mondayNightDifference = null;
      if (mondayNightPick !== null && actualMondayTotal !== null) {
        mondayNightDifference = Math.abs(mondayNightPick - actualMondayTotal);
      }

      stats[profile.user_id] = {
        correctPicks,
        totalPicks: totalGamesInWeek,
        percentage,
        mondayNightPick,
        actualMondayTotal,
        mondayNightDifference,
        hasMadePicks
      };
    });

    console.log(`🎯 Finding winners for week ${activeWeek}`);
    console.log(`👥 Players who made picks:`, playersWithPicks);

    // If no players made picks for this week, no winners
    if (playersWithPicks.length === 0) {
      console.log(`❌ No players made picks for week ${activeWeek}`);
      setUserStats(stats);
      setBestPerformers({
        paidMostCorrect: [],
        unpaidMostCorrect: []
      });
      return;
    }

    // Separate players by paid status
    const paidPlayers = playersWithPicks.filter(userId => paidStatus[userId] || false);
    const unpaidPlayers = playersWithPicks.filter(userId => !paidStatus[userId]);
    
    console.log(`💰 Paid players:`, paidPlayers);
    console.log(`🚫 Unpaid players:`, unpaidPlayers);

    // Find PAID winner(s)
    let maxCorrectPaid = 0;
    let paidWinners: string[] = [];
    
    if (paidPlayers.length > 0) {
      paidPlayers.forEach(userId => {
        const userStat = stats[userId];
        if (userStat.correctPicks > maxCorrectPaid) {
          maxCorrectPaid = userStat.correctPicks;
        }
      });
      
      const paidPlayersWithMax = paidPlayers.filter(userId => 
        stats[userId].correctPicks === maxCorrectPaid
      );
      
      console.log(`💰 Paid players with ${maxCorrectPaid} correct:`, paidPlayersWithMax);

      if (paidPlayersWithMax.length === 1) {
        paidWinners = paidPlayersWithMax;
      } else if (paidPlayersWithMax.length > 1) {
        let bestMNFDifference = Infinity;
        paidPlayersWithMax.forEach(userId => {
          const userStat = stats[userId];
          if (userStat.mondayNightDifference !== null && userStat.mondayNightDifference < bestMNFDifference) {
            bestMNFDifference = userStat.mondayNightDifference;
          }
        });
        
        paidPlayersWithMax.forEach(userId => {
          const userStat = stats[userId];
          if (userStat.mondayNightDifference === bestMNFDifference) {
            paidWinners.push(userId);
          }
        });
        
        console.log(`🏆 Paid winners after MNF tie-breaker:`, paidWinners);
      }
    }

    // Find UNPAID winner(s) - ONLY if they BEAT the paid winner's score
    let unpaidWinners: string[] = [];
    
    if (unpaidPlayers.length > 0 && maxCorrectPaid > 0) {
      let maxCorrectUnpaid = 0;
      unpaidPlayers.forEach(userId => {
        const userStat = stats[userId];
        if (userStat.correctPicks > maxCorrectUnpaid) {
          maxCorrectUnpaid = userStat.correctPicks;
        }
      });
      
      console.log(`🚫 Max correct among unpaid: ${maxCorrectUnpaid} vs Paid winner: ${maxCorrectPaid}`);
      
      // UNPAID player only wins if they have MORE correct picks than the paid winner
      if (maxCorrectUnpaid > maxCorrectPaid) {
        const unpaidPlayersWithMax = unpaidPlayers.filter(userId => 
          stats[userId].correctPicks === maxCorrectUnpaid
        );
        
        if (unpaidPlayersWithMax.length === 1) {
          unpaidWinners = unpaidPlayersWithMax;
        } else if (unpaidPlayersWithMax.length > 1) {
          let bestMNFDifference = Infinity;
          unpaidPlayersWithMax.forEach(userId => {
            const userStat = stats[userId];
            if (userStat.mondayNightDifference !== null && userStat.mondayNightDifference < bestMNFDifference) {
              bestMNFDifference = userStat.mondayNightDifference;
            }
          });
          
          unpaidPlayersWithMax.forEach(userId => {
            const userStat = stats[userId];
            if (userStat.mondayNightDifference === bestMNFDifference) {
              unpaidWinners.push(userId);
            }
          });
        }
        console.log(`🥈 Unpaid winners (beat paid winner):`, unpaidWinners);
      } else {
        console.log(`❌ No unpaid winners - none beat paid winner's score of ${maxCorrectPaid}`);
      }
    }

    console.log(`✅ FINAL RESULTS for week ${activeWeek}:`);
    console.log(`🏆 Paid Winners:`, paidWinners.map(id => {
      const user = weekProfiles.find(p => p.user_id === id);
      return `${user?.username} (${stats[id]?.correctPicks} correct, MNF: ${stats[id]?.mondayNightDifference})`;
    }));
    console.log(`🥈 Unpaid Winners:`, unpaidWinners.map(id => {
      const user = weekProfiles.find(p => p.user_id === id);
      return `${user?.username} (${stats[id]?.correctPicks} correct, MNF: ${stats[id]?.mondayNightDifference})`;
    }));

    setUserStats(stats);
    setBestPerformers({
      paidMostCorrect: paidWinners,
      unpaidMostCorrect: unpaidWinners
    });
  }, [games, picks, profiles, activeWeek, paidStatus, gamesByWeek, fixedWeekData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const refreshEspnScores = async () => {
    if (!isAdmin || updatingScores) return;
    setUpdatingScores(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) throw new Error("Please log in again.");
      const response = await fetch("/api/update-scores", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Score update failed");
      setScoreRefreshVersion(version => version + 1);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Score update failed");
    } finally {
      setUpdatingScores(false);
    }
  };

  // Handle week selection
  const handleWeekSelect = (week: number) => {
    setUserSelectedWeek(true);
    setActiveWeek(week);

    setTimeout(() => {
      fetchDirectWeekData(week);
    }, 100);
  };

  // ADDED: Get user picks for active week - USING FIXED DATA FOR WEEK 18
  const getUserPicksForActiveWeek = (userId: string) => {
    if (!activeWeek) return [];
    
    if (fixedWeekData.picksByUser[userId]) {
      return fixedWeekData.picksByUser[userId];
    }
    
    return picks.filter(pick => pick.user_id === userId);
  };

  // ADDED: Get games for active week - USING FIXED DATA FOR WEEK 18
  const getActiveWeekGames = () => {
    if (!activeWeek) return [];
    
    if (fixedWeekData.games.length > 0) {
      return fixedWeekData.games;
    }
    
    return gamesByWeek[activeWeek] || [];
  };

  // Sort profiles - FIXED: Show ALL users who made picks
  const getSortedProfiles = () => {
    // SPECIAL HANDLING FOR WEEK 18 - Use fixed data
    if (fixedWeekData.users.length > 0) {
      return fixedWeekData.users.sort((a, b) => {
        const statsA = userStats[a.user_id] || { percentage: 0, correctPicks: 0 };
        const statsB = userStats[b.user_id] || { percentage: 0, correctPicks: 0 };
        
        if (sortBy === 'percentage') {
          if (sortOrder === 'desc') {
            if (statsB.percentage !== statsA.percentage) {
              return statsB.percentage - statsA.percentage;
            }
            return statsB.correctPicks - statsA.correctPicks;
          } else {
            if (statsA.percentage !== statsB.percentage) {
              return statsA.percentage - statsB.percentage;
            }
            return statsA.correctPicks - statsB.correctPicks;
          }
        } else {
          if (sortOrder === 'desc') {
            return b.username.localeCompare(a.username);
          } else {
            return a.username.localeCompare(b.username);
          }
        }
      });
    }
    
    // For other weeks, use normal logic
    const usersWithPicks = profiles.filter(profile => {
      const stats = userStats[profile.user_id];
      return stats?.hasMadePicks || false;
    });

    return usersWithPicks.sort((a, b) => {
      const statsA = userStats[a.user_id] || { percentage: 0 };
      const statsB = userStats[b.user_id] || { percentage: 0 };
      
      if (sortBy === 'percentage') {
        if (sortOrder === 'desc') {
          return statsB.percentage - statsA.percentage;
        } else {
          return statsA.percentage - statsB.percentage;
        }
      } else {
        if (sortOrder === 'desc') {
          return b.username.localeCompare(a.username);
        } else {
          return a.username.localeCompare(b.username);
        }
      }
    });
  };

  // Handle sort click
  const handleSortClick = (column: 'percentage' | 'name') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const formatGameLabel = (game: Game) => {
    let label = `${game.awayTeam} @ ${game.homeTeam}`;
    if (game.is_monday_night) {
      label += " (MNF)";
    }
    return label;
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Denver",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Get current week for display
  const getCurrentWeekDisplay = () => {
    if (!activeWeek) return null;
    
    const weekGames = getActiveWeekGames();
    const hasUpcomingGames = weekGames.some(game => new Date(game.startTime) > now);
    const hasLiveGames = weekGames.some(game => game.status === "InProgress");

    if (hasLiveGames) return `Week ${activeWeek} (Live)`;
    if (hasUpcomingGames) return `Week ${activeWeek} (Current)`;
    return `Week ${activeWeek} (Completed)`;
  };

  // Live scores for the week on screen (and the game whose details are open)
  const live = useLiveScores(seasonYear, activeWeek);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-slate-600">
        Loading all picks...
      </div>
    );
  }

  const activeWeekGames = getActiveWeekGames();
  const sortedProfiles = getSortedProfiles();
  const mondayNightGame = activeWeekGames.find((game: Game) => game.is_monday_night);
  const mondayNightLocked = mondayNightGame ? isLocked(mondayNightGame.startTime) : false;
  const mondayNightFinal = mondayNightGame?.status === "Final";
  const finalCount = activeWeekGames.filter((g) => g.status === "Final").length;
  const liveCount = activeWeekGames.filter((g) => g.status === "InProgress").length;

  const sortArrow = (column: "percentage" | "name") =>
    sortBy === column ? (sortOrder === "desc" ? " ↓" : " ↑") : "";

  // Shared cell styles
  const th = "whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500";
  const td = "whitespace-nowrap px-3 py-2.5 text-center";
  const tooltip =
    "absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-white shadow-xl";

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <header className="sticky top-[env(safe-area-inset-top)] z-50 bg-ink text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-extrabold leading-tight tracking-tight">All Picks</h1>
            <p className="text-xs text-slate-400">
              Season {seasonYear}
              {activeWeek ? ` · ${getCurrentWeekDisplay()}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-200">{userEmail}</p>
              <p className="text-xs text-slate-400">{isAdmin ? "Admin" : "Player"}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 font-bold text-white">
              {userEmail?.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        {/* Week selector */}
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
          {Object.keys(gamesByWeek).map((week) => {
            const weekNum = Number(week);
            const weekGames = gamesByWeek[weekNum] || [];
            const hasUpcomingGames = weekGames.some((game) => new Date(game.startTime) > now);
            const hasLiveGames = weekGames.some((game) => game.status === "InProgress");
            const selected = activeWeek === weekNum;

            return (
              <button
                key={week}
                onClick={() => handleWeekSelect(weekNum)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  selected
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-slate-900"
                }`}
              >
                Week {week}
                {hasLiveGames ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" title="Live" />
                ) : hasUpcomingGames ? (
                  <span className={`h-2 w-2 rounded-full ${selected ? "bg-white/70" : "bg-sky-400"}`} title="Upcoming" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Quick stats */}
        {activeWeek && (
          <div className="mb-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-2xl font-extrabold text-slate-800">{sortedProfiles.length}</div>
              <div className="text-xs font-medium text-slate-500">Players</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-2xl font-extrabold text-slate-800">
                {finalCount}
                <span className="text-base font-semibold text-slate-400">/{activeWeekGames.length}</span>
              </div>
              <div className="text-xs font-medium text-slate-500">Games final</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className={`text-2xl font-extrabold ${liveCount > 0 ? "text-rose-600" : "text-slate-800"}`}>
                {liveCount}
              </div>
              <div className="text-xs font-medium text-slate-500">Live now</div>
            </div>
          </div>
        )}

        {activeWeek && activeWeekGames.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[75vh] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-slate-50">
                    <th className={`${th} sticky left-0 z-30 border-b border-slate-200 bg-slate-50 text-left`}>
                      <button onClick={() => handleSortClick("name")} className="uppercase hover:text-slate-900">
                        Player{sortArrow("name")}
                      </button>
                    </th>
                    <th className={`${th} border-b border-slate-200 bg-slate-50`}>
                      <button onClick={() => handleSortClick("percentage")} className="uppercase hover:text-slate-900">
                        Score{sortArrow("percentage")}
                      </button>
                    </th>
                    <th className={`${th} border-b border-slate-200 bg-slate-50`}>Paid</th>

                    {activeWeekGames.map((game) => {
                      const locked = isLocked(game.startTime);
                      const liveGame = live[game.id];
                      const isLive = liveGame ? liveGame.state === "in" : game.status === "InProgress";
                      const isFinal = liveGame ? liveGame.state === "post" : game.status === "Final";
                      const awayScore = liveGame?.away.score ?? game.away_score;
                      const homeScore = liveGame?.home.score ?? game.home_score;
                      return (
                        <th
                          key={game.id}
                          className={`${th} relative cursor-pointer border-b border-slate-200 bg-slate-50 hover:bg-slate-100 ${
                            game.is_monday_night ? "bg-indigo-50" : ""
                          }`}
                          onMouseEnter={() => setHoveredGame(game.id)}
                          onMouseLeave={() => setHoveredGame(null)}
                          onClick={() => {
                            setHoveredGame(null);
                            setSelectedGameId(game.id);
                          }}
                        >
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[11px] font-bold normal-case tracking-normal text-slate-700">
                              {game.awayTeam}
                              <span className="font-normal text-slate-400"> @ </span>
                              {game.homeTeam}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                                isFinal
                                  ? "bg-slate-200 text-slate-700"
                                  : isLive
                                  ? "bg-rose-100 text-rose-700"
                                  : locked
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {isFinal
                                ? homeScore != null && awayScore != null
                                  ? `${awayScore}–${homeScore}`
                                  : "FINAL"
                                : isLive
                                ? awayScore != null && homeScore != null
                                  ? `${awayScore}–${homeScore}`
                                  : "LIVE"
                                : locked
                                ? "LOCKED"
                                : "OPEN"}
                            </span>
                            {isLive && liveGame && (
                              <span className="text-[10px] font-bold normal-case tracking-normal text-rose-700">
                                {periodLabel(liveGame.period)} {liveGame.clock}
                              </span>
                            )}
                            {game.is_monday_night && (
                              <span className="text-[10px] font-bold text-indigo-600">MNF</span>
                            )}
                          </div>

                          {hoveredGame === game.id && (
                            <div className={tooltip}>
                              <div className="font-semibold">{formatGameLabel(game)}</div>
                              <div className="mt-1 text-slate-300">{formatTime(game.startTime)} MT</div>
                              <div className="mt-1 font-semibold text-amber-300">
                                {getLockMessage(new Date(game.startTime), game.id)}
                              </div>
                            </div>
                          )}
                        </th>
                      );
                    })}

                    <th className={`${th} border-b border-slate-200 bg-indigo-50 text-indigo-700`}>MNF Guess</th>
                    <th className={`${th} border-b border-slate-200 bg-indigo-50 text-indigo-700`}>Actual</th>
                    <th className={`${th} border-b border-slate-200 bg-indigo-50 text-indigo-700`}>Diff</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedProfiles.map((user) => {
                    const stats = userStats[user.user_id] || {
                      correctPicks: 0,
                      totalPicks: 0,
                      percentage: 0,
                      mondayNightPick: null,
                      actualMondayTotal: null,
                      mondayNightDifference: null,
                    };

                    const userPaidStatus = paidStatus[user.user_id] || false;
                    const isPaidWinner = bestPerformers.paidMostCorrect.includes(user.user_id);
                    const isUnpaidWinner = bestPerformers.unpaidMostCorrect.includes(user.user_id);

                    // Row tint: winners get a soft highlight, everyone else plain white
                    const rowBg = isPaidWinner ? "bg-emerald-50" : isUnpaidWinner ? "bg-amber-50" : "bg-white";
                    const cell = `${td} border-b border-slate-100 ${rowBg}`;
                    const userPicks = getUserPicksForActiveWeek(user.user_id);

                    return (
                      <tr key={user.user_id} className="group">
                        {/* Player (sticky) */}
                        <td
                          className={`${cell} sticky left-0 ${hoveredUser === user.user_id ? "z-40" : "z-10"} text-left ${
                            isPaidWinner
                              ? "border-l-4 border-l-emerald-500"
                              : isUnpaidWinner
                              ? "border-l-4 border-l-amber-400"
                              : "border-l-4 border-l-transparent"
                          }`}
                          onMouseEnter={() => setHoveredUser(user.user_id)}
                          onMouseLeave={() => setHoveredUser(null)}
                          onTouchStart={() => setHoveredUser(user.user_id)}
                        >
                          <div className="relative">
                            <div className="font-bold text-slate-800">{user.username}</div>
                            {isPaidWinner && (
                              <div className="text-[11px] font-semibold text-emerald-700">🏆 Weekly winner</div>
                            )}
                            {isUnpaidWinner && (
                              <div className="text-[11px] font-semibold text-amber-700">Would have won (unpaid)</div>
                            )}
                            {hoveredUser === user.user_id && (
                              <div className="absolute left-0 top-full z-30 mt-2 whitespace-nowrap rounded-xl bg-slate-900 px-3 py-2 text-left text-xs font-normal text-white shadow-xl">
                                <div className="font-semibold">
                                  {user.first_name} {user.last_name}
                                </div>
                                <div className="mt-1 text-slate-300">{user.email}</div>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Score */}
                        <td className={cell}>
                          <div className="font-bold text-slate-800">
                            {stats.correctPicks}
                            <span className="font-normal text-slate-400">/{stats.totalPicks}</span>
                          </div>
                          <div className="text-[11px] text-slate-500">{stats.percentage}%</div>
                        </td>

                        {/* Paid */}
                        <td
                          className={`${cell} ${isAdmin && !updatingPaidStatus ? "cursor-pointer" : ""}`}
                          onClick={() => isAdmin && !updatingPaidStatus && setEditingPaidStatus(user.user_id)}
                        >
                          {updatingPaidStatus === user.user_id ? (
                            <span className="text-xs text-slate-400">Saving...</span>
                          ) : editingPaidStatus === user.user_id ? (
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePaidStatus(user.user_id);
                                }}
                                className={`rounded-lg px-2 py-1 text-xs font-semibold text-white ${
                                  userPaidStatus ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-600 hover:bg-emerald-700"
                                }`}
                              >
                                {userPaidStatus ? "Mark unpaid" : "Mark paid"}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingPaidStatus(null);
                                }}
                                className="rounded-lg bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <span
                              className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                userPaidStatus ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                              } ${isAdmin ? "group-hover:ring-2 group-hover:ring-amber-300" : ""}`}
                            >
                              {userPaidStatus ? "PAID" : "UNPAID"}
                            </span>
                          )}
                        </td>

                        {/* Game picks */}
                        {activeWeekGames.map((game: Game) => {
                          const locked = isLocked(game.startTime);
                          const userPick = userPicks.find((p) => p.game_id === game.id);
                          const isFinal = game.status === "Final";
                          const isCorrect = isFinal && userPick?.selected_team === game.winner;

                          let pill = "bg-slate-100 text-slate-700"; // locked, game not finished
                          if (!locked) pill = "bg-transparent text-slate-300";
                          else if (!userPick) pill = "bg-transparent text-slate-300";
                          else if (isFinal) pill = isCorrect ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700 line-through decoration-rose-300";

                          return (
                            <td key={game.id} className={`${cell} ${game.is_monday_night && rowBg === "bg-white" ? "bg-indigo-50/40" : ""}`}>
                              <span className={`inline-block min-w-[3rem] rounded-lg px-2 py-1 text-xs font-bold ${pill}`}>
                                {!locked ? "🔒" : userPick?.selected_team ?? "—"}
                              </span>
                            </td>
                          );
                        })}

                        {/* Monday Night */}
                        <td className={`${cell} font-semibold text-slate-700`}>
                          {mondayNightLocked ? stats.mondayNightPick ?? "—" : "🔒"}
                        </td>
                        <td className={`${cell} text-slate-500`}>
                          {mondayNightFinal && stats.actualMondayTotal !== null ? stats.actualMondayTotal : "—"}
                        </td>
                        <td className={`${cell} font-semibold text-slate-700`}>
                          {mondayNightFinal && stats.mondayNightDifference !== null ? stats.mondayNightDifference : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            No games found for the selected week.
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800">KC</span> Correct
          </span>
          <span className="flex items-center gap-1.5">
            <span className="rounded-md bg-rose-100 px-1.5 py-0.5 font-bold text-rose-700 line-through">KC</span> Wrong
          </span>
          <span className="flex items-center gap-1.5">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-700">KC</span> In progress
          </span>
          <span className="flex items-center gap-1.5">🔒 Hidden until the game locks</span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-1 rounded bg-emerald-500" /> Weekly winner
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-1 rounded bg-amber-400" /> Would have won (unpaid)
          </span>
        </div>

        {/* How it works (collapsed by default) */}
        <details className="group mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-bold text-slate-800">
            How this page works
            <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="space-y-4 border-t border-slate-100 p-4 text-sm text-slate-600">
            <div>
              <h4 className="mb-1 font-semibold text-slate-800">When picks lock (Mountain Time)</h4>
              <ul className="list-disc space-y-1 pl-5">
                <li>Thursday, Friday and Saturday games lock at their own kickoff.</li>
                <li>Sunday games before 2:00 PM lock at their own kickoff.</li>
                <li>Sunday games at or after 2:00 PM, and Monday Night, all lock when the first of those Sunday games starts.</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-1 font-semibold text-slate-800">Winning</h4>
              <p>
                Only paid players can win the week. Most correct picks wins, and ties are broken by whoever is closest
                on the Monday Night total.
              </p>
            </div>
            <div>
              <h4 className="mb-1 font-semibold text-slate-800">Tips</h4>
              <p>Tap a game header for kickoff time and lock countdown. Tap a player for their full name. Tap Player or Score to sort.</p>
              {isAdmin && <p className="mt-1">Admins: tap a Paid badge to change it.</p>}
            </div>
          </div>
        </details>
      </main>

      {(() => {
        const g = activeWeekGames.find((game) => game.id === selectedGameId);
        return (
          <GameDetailSheet
            game={
              g
                ? {
                    id: g.id,
                    homeTeam: g.homeTeam,
                    awayTeam: g.awayTeam,
                    startTime: g.startTime,
                    homeScore: g.home_score,
                    awayScore: g.away_score,
                    status: g.status,
                  }
                : null
            }
            live={g ? live[g.id] : undefined}
            onClose={() => setSelectedGameId(null)}
          />
        );
      })()}
    </div>
  );
};

export default AllPicksPage;
