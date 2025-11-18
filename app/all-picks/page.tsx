"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
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
  const [hoveredLockIndicator, setHoveredLockIndicator] = useState<string | null>(null);
  const [userSelectedWeek, setUserSelectedWeek] = useState<boolean>(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [storingWinners, setStoringWinners] = useState(false);

  const SEASON_YEAR = 2025;

  // Get current time in MST (same as MakePicksPage)
  function getNowMST(): Date {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Denver" })
    );
  }

  // Countdown timer for game start
  const getCountdown = (startTime: string) => {
    const gameTime = new Date(startTime);
    const nowMST = getNowMST();
    const diff = gameTime.getTime() - nowMST.getTime();
    
    if (diff <= 0) return "Game started";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
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
        .eq('season', SEASON_YEAR)
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
            season: SEASON_YEAR,
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
            season: SEASON_YEAR,
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
        .eq('season', SEASON_YEAR);

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
            .eq('season', SEASON_YEAR)
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
      .eq('season_year', SEASON_YEAR);

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
      .eq('season', SEASON_YEAR)
      .order('week');
    
    console.log("Existing winners in DB:", allWinners);
  };

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
        .eq('season_year', SEASON_YEAR);

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
          season_year: SEASON_YEAR,
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

        const { data: gameData } = await supabase.from("games").select("*");
        
        const filteredGameData = (gameData || []).filter((g: any) => 
          g.team_a && g.team_b && 
          g.team_a.trim() !== '' && g.team_b.trim() !== '' &&
          g.team_a.toLowerCase() !== 'bye' && g.team_b.toLowerCase() !== 'bye'
        );

        const mappedGames: Game[] = filteredGameData.map((g: any) => {
          const utcDate = new Date(g.start_time);
          const mstDate = new Date(utcDate.getTime() - 7 * 60 * 60 * 1000);

          return {
            id: g.id,
            week: g.week,
            startTime: mstDate.toISOString(),
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

        const { data: pickData } = await supabase.from("game_picks").select("*");
        setPicks(pickData || []);

        // FIXED: IMPROVED WEEK SELECTION - Find the CURRENT week with upcoming/live games
        if (!userSelectedWeek) {
          const weekNumbers = Array.from(new Set(sortedGames.map((g) => g.week))).sort((a, b) => a - b);
          const nowMST = getNowMST();
          
          let newActiveWeek = activeWeek;
          
          console.log("🔍 WEEK DETECTION LOGIC:");
          console.log("All weeks:", weekNumbers);
          
          // Find the current week - look for weeks with upcoming or live games
          for (let week of weekNumbers) {
            const weekGames = sortedGames.filter(g => g.week === week);
            
            if (weekGames.length === 0) continue;
            
            const hasUpcomingGames = weekGames.some(game => new Date(game.startTime) > nowMST);
            const hasLiveGames = weekGames.some(game => game.status === "InProgress");
            const allGamesFinal = weekGames.every(game => game.status === "Final");
            
            console.log(`Week ${week}: upcoming=${hasUpcomingGames}, live=${hasLiveGames}, allFinal=${allGamesFinal}`);
            
            // Priority 1: Weeks with live games
            if (hasLiveGames) {
              newActiveWeek = week;
              console.log(`🎯 Setting active week to ${week} - has LIVE games`);
              break;
            }
            
            // Priority 2: Weeks with upcoming games (not all final)
            if (hasUpcomingGames && !allGamesFinal) {
              newActiveWeek = week;
              console.log(`🎯 Setting active week to ${week} - has UPCOMING games`);
              break;
            }
            
            // Priority 3: If we haven't found an active week yet, use the most recent week with games
            if (!newActiveWeek) {
              newActiveWeek = week;
              console.log(`📌 Setting fallback week to ${week}`);
            }
          }
          
          // Final fallback: use the highest week number
          if (!newActiveWeek && weekNumbers.length > 0) {
            newActiveWeek = weekNumbers[weekNumbers.length - 1];
            console.log(`🔄 Using highest week as fallback: ${newActiveWeek}`);
          }
          
          if (newActiveWeek) {
            setActiveWeek(newActiveWeek);
            console.log(`📅 FINAL active week: ${newActiveWeek}`);
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error("Error loading All Picks:", err);
        setLoading(false);
      }
    };

    fetchData();
  }, [userSelectedWeek]);

  // Call cleanup when component mounts
  useEffect(() => {
    if (games.length > 0 && profiles.length > 0 && picks.length > 0) {
      cleanupIncorrectWinners();
    }
  }, [games, profiles, picks]);

  // Refetch paid status when active week changes
  useEffect(() => {
    if (activeWeek && profiles.length > 0) {
      fetchPaidStatus();
    }
  }, [activeWeek, profiles]);

  // FIXED: Calculate user stats and best performers for ACTIVE WEEK only
  useEffect(() => {
    if (games.length === 0 || picks.length === 0 || profiles.length === 0 || !activeWeek) return;

    const stats: Record<string, UserStats> = {};
    const playersWithPicks: string[] = [];
    
    profiles.forEach(profile => {
      const userPicks = picks.filter(pick => pick.user_id === profile.user_id);
      const weekGames = games.filter(game => game.week === activeWeek);
      
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
      const profile = profiles.find(p => p.user_id === id);
      return `${profile?.username} (${stats[id]?.correctPicks} correct, MNF: ${stats[id]?.mondayNightDifference})`;
    }));
    console.log(`🥈 Unpaid Winners:`, unpaidWinners.map(id => {
      const profile = profiles.find(p => p.user_id === id);
      return `${profile?.username} (${stats[id]?.correctPicks} correct, MNF: ${stats[id]?.mondayNightDifference})`;
    }));

    setUserStats(stats);
    setBestPerformers({
      paidMostCorrect: paidWinners,
      unpaidMostCorrect: unpaidWinners
    });
  }, [games, picks, profiles, activeWeek, paidStatus]);

  // ---------- Timer (needed for locked games and countdown) ----------
  useEffect(() => {
    const interval = setInterval(() => setNow(getNowMST()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Handle week selection
  const handleWeekSelect = (week: number) => {
    setUserSelectedWeek(true);
    setActiveWeek(week);
  };

  // Sort profiles - FIXED: Show ALL users who made picks
  const getSortedProfiles = () => {
    const usersWithPicks = profiles.filter(profile => {
      const stats = userStats[profile.user_id];
      return stats?.hasMadePicks || false;
    });

    console.log(`👥 Showing ${usersWithPicks.length} users with picks for week ${activeWeek}`);

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

  const isLocked = (isoDate: string) => {
    const gameTime = new Date(isoDate);
    return now.getTime() >= gameTime.getTime();
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

  const gamesByWeek: Record<number, Game[]> = {};
  games.forEach((g) => {
    if (!gamesByWeek[g.week]) gamesByWeek[g.week] = [];
    gamesByWeek[g.week].push(g);
  });

  // Get current week for display
  const getCurrentWeekDisplay = () => {
    if (!activeWeek) return null;
    
    const weekGames = gamesByWeek[activeWeek] || [];
    const hasUpcomingGames = weekGames.some(game => new Date(game.startTime) > now);
    const hasLiveGames = weekGames.some(game => game.status === "InProgress");

    if (hasLiveGames) return `Week ${activeWeek} (Live)`;
    if (hasUpcomingGames) return `Week ${activeWeek} (Current)`;
    return `Week ${activeWeek} (Completed)`;
  };

  // Get games for active week with null safety
  const getActiveWeekGames = () => {
    if (!activeWeek || !gamesByWeek[activeWeek]) return [];
    return gamesByWeek[activeWeek];
  };

  // Navigation items
  const navItems = [
    { href: "/", label: "Home", icon: "🏠" },
    { href: "/make-picks", label: "Make Picks", icon: "🏈" },
    { href: "/pick-summary", label: "Pick Percentages", icon: "📈" },
    { href: "/standings", label: "Standings", icon: "🏆" },
    { href: "/rules", label: "Rules", icon: "📋" },
    { href: "/profile", label: "Profile", icon: "👤" },
  ];

  if (loading) return <div className="p-6 text-lg">Loading all picks...</div>;

  const activeWeekGames = getActiveWeekGames();
  const sortedProfiles = getSortedProfiles();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Expandable Header Bar - Opens to the Left */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        {/* Main Header Bar */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            {/* Expand Button */}
            <button
              onClick={() => setHeaderExpanded(!headerExpanded)}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 bg-gray-100 border border-gray-300"
              title={headerExpanded ? "Collapse menu" : "Expand menu"}
            >
              <span className="text-xl text-gray-800">{headerExpanded ? "✕" : "☰"}</span>
              <span className="font-semibold text-gray-800 hidden sm:block">
                {headerExpanded ? "Close Menu" : "Menu"}
              </span>
            </button>

            {/* Logo/Title */}
            <h1 className="text-2xl font-bold text-gray-800">All Player Picks</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {/* User Info */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                {userEmail?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-gray-700">
                  {userEmail}
                </p>
                <p className="text-xs text-gray-500">
                  {isAdmin ? 'Admin' : 'User'}
                </p>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="bg-red-500 text-white px-3 py-2 rounded text-sm font-medium hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Expandable Navigation Panel - Opens to the Left */}
        {headerExpanded && (
          <div className="absolute top-full left-0 w-80 bg-white border-b border-r border-gray-200 shadow-lg z-40">
            <div className="p-6">
              {/* Navigation Header */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Navigation</h2>
                <p className="text-sm text-gray-600">Quick access to all features</p>
              </div>

              {/* Navigation Grid */}
              <div className="grid grid-cols-1 gap-3">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 group border border-gray-200 hover:border-blue-200"
                    onClick={() => setHeaderExpanded(false)}
                  >
                    <span className="text-2xl group-hover:scale-110 transition-transform">
                      {item.icon}
                    </span>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800 group-hover:text-blue-800">
                        {item.label}
                      </div>
                      <div className="text-xs text-gray-500 group-hover:text-blue-600 mt-1">
                        Click to navigate
                      </div>
                    </div>
                    <span className="text-gray-400 group-hover:text-blue-500 transition-colors">
                      →
                    </span>
                  </Link>
                ))}
              </div>

              {/* Quick Stats */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-800 mb-3">Current Week Stats</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-blue-600">
                      {activeWeek ? (gamesByWeek[activeWeek]?.length || 0) : 0}
                    </div>
                    <div className="text-xs text-blue-800">Games</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-green-600">
                      {sortedProfiles.length}
                    </div>
                    <div className="text-xs text-green-800">Players</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-purple-600">{activeWeek || 1}</div>
                    <div className="text-xs text-purple-800">Week</div>
                  </div>
                </div>
              </div>

              {/* Admin Badge */}
              {isAdmin && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-600">🔧</span>
                    <span className="text-sm font-semibold text-yellow-800">Admin Mode Active</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="p-6">
        {/* Admin badge */}
        {isAdmin && (
          <div className="mb-4 p-2 bg-yellow-100 border border-yellow-400 rounded-lg inline-block">
            <span className="text-yellow-800 font-semibold">🔧 Admin Mode</span>
          </div>
        )}

        {/* Current Week Display */}
        {activeWeek && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <h2 className="text-xl font-semibold text-blue-800">
              {getCurrentWeekDisplay()}
            </h2>
            <p className="text-sm text-blue-600 mt-1">
              Showing {sortedProfiles.length} players who made picks for this week
            </p>
          </div>
        )}

        {/* Admin Winner Controls */}
        {isAdmin && activeWeek && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-800 mb-2">Admin: Weekly Winners</h3>
            <div className="flex flex-wrap gap-4 items-center">
              <button
                onClick={async () => {
                  if (confirm(`Store winners for Week ${activeWeek}? This will save paid and unpaid winners to the database.`)) {
                    const result = await storeWeeklyWinners(activeWeek);
                    if (result.success) {
                      alert(`✅ Winners stored successfully for Week ${activeWeek}!`);
                    } else {
                      alert(`❌ Failed to store winners: ${result.message}`);
                    }
                  }
                }}
                disabled={storingWinners}
                className="bg-green-500 text-white px-4 py-2 rounded font-semibold hover:bg-green-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {storingWinners ? '💾 Storing...' : '💾 Store Winners for Week ' + activeWeek}
              </button>
              
              <button
                onClick={debugWeekDetection}
                className="bg-gray-500 text-white px-4 py-2 rounded font-semibold hover:bg-gray-600 transition-colors"
              >
                🐛 Debug Week Detection
              </button>
              
              <button
                onClick={debugCurrentWeek}
                className="bg-purple-500 text-white px-4 py-2 rounded font-semibold hover:bg-purple-600 transition-colors"
              >
                🔍 Debug Current Week
              </button>
              
              <button
                onClick={async () => {
                  const { data: existingWinners } = await supabase
                    .from('weekly_winners')
                    .select('*')
                    .eq('season', SEASON_YEAR)
                    .eq('week', activeWeek);
                  
                  if (existingWinners && existingWinners.length > 0) {
                    alert(`Winners for Week ${activeWeek}:\n${existingWinners.map(w => 
                      `${w.player_name} (${w.is_paid_winner ? 'Paid' : 'Unpaid'}) - ${w.correct_picks} correct${w.is_tied ? ' - Tied' : ''}`
                    ).join('\n')}`);
                  } else {
                    alert(`No winners stored yet for Week ${activeWeek}`);
                  }
                }}
                className="bg-blue-500 text-white px-4 py-2 rounded font-semibold hover:bg-blue-600 transition-colors"
              >
                👀 View Stored Winners
              </button>
              
              <div className="text-sm text-yellow-700">
                Paid Winners: {bestPerformers.paidMostCorrect.length} | 
                Unpaid Winners: {bestPerformers.unpaidMostCorrect.length}
              </div>
            </div>
          </div>
        )}

        {/* Week tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {Object.keys(gamesByWeek).map((week) => {
            const weekNum = Number(week);
            const weekGames = gamesByWeek[weekNum] || [];
            const hasUpcomingGames = weekGames.some(game => new Date(game.startTime) > now);
            const hasLiveGames = weekGames.some(game => game.status === "InProgress");
            const isCurrentWeek = activeWeek === weekNum;
            
            return (
              <button
                key={week}
                onClick={() => handleWeekSelect(weekNum)}
                className={`px-4 py-2 rounded font-semibold transition-colors min-w-[100px] ${
                  isCurrentWeek 
                    ? "bg-blue-600 text-white border-2 border-blue-700" 
                    : hasLiveGames
                      ? "bg-green-600 text-white border border-green-700 hover:bg-green-700"
                      : hasUpcomingGames 
                        ? "bg-green-100 text-green-800 border border-green-300 hover:bg-green-200"
                        : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
                }`}
              >
                Week {week}
                {hasLiveGames && " 🔴"}
                {hasUpcomingGames && !hasLiveGames && " ⏱️"}
              </button>
            );
          })}
        </div>

        {activeWeek && activeWeekGames.length > 0 ? (
          <div className="border border-gray-300 rounded-lg">
            {/* Table container with max height and scrolling */}
            <div className="overflow-x-auto max-h-[80vh] overflow-y-auto">
              <table className="table-auto border-collapse w-full text-center">
                <thead className="sticky top-0 bg-gray-100 z-10">
                  <tr>
                    {/* Paid Column - NOT Sticky */}
                    <th className="border border-gray-300 p-3 font-bold text-gray-800 bg-yellow-100">
                      Paid
                      {isAdmin && (
                        <div className="text-xs font-normal text-gray-600 mt-1">
                          (Click to edit)
                        </div>
                      )}
                    </th>
                    
                    {/* Player Column - Sticky */}
                    <th className="border border-gray-300 p-3 font-bold text-gray-800 sticky top-0 left-0 z-20 bg-gray-100">
                      <button 
                        onClick={() => handleSortClick('name')}
                        className="hover:bg-gray-200 px-2 py-1 rounded transition-colors flex items-center gap-1 mx-auto"
                      >
                        Player
                        {sortBy === 'name' && (
                          <span className="text-xs">
                            {sortOrder === 'desc' ? '↓' : '↑'}
                          </span>
                        )}
                      </button>
                    </th>
                    
                    {/* Correct Column - NOT Sticky */}
                    <th className="border border-gray-300 p-3 font-bold text-gray-800 bg-gray-100">Correct</th>
                    
                    {/* Percentage Column - NOT Sticky */}
                    <th className="border border-gray-300 p-3 font-bold text-gray-800 bg-gray-100">
                      <button 
                        onClick={() => handleSortClick('percentage')}
                        className="hover:bg-gray-200 px-2 py-1 rounded transition-colors flex items-center gap-1 mx-auto"
                      >
                        %
                        {sortBy === 'percentage' && (
                          <span className="text-xs">
                            {sortOrder === 'desc' ? '↓' : '↑'}
                          </span>
                        )}
                      </button>
                    </th>
                    
                    {/* Game columns - Scroll horizontally */}
                    {activeWeekGames.map((game) => (
                      <th 
                        key={game.id} 
                        className="border border-gray-300 p-3 font-bold text-gray-800 sticky top-0 bg-gray-100 relative"
                        onMouseEnter={() => setHoveredGame(game.id)}
                        onMouseLeave={() => setHoveredGame(null)}
                        onTouchStart={() => setHoveredGame(game.id)}
                      >
                        <div className="cursor-help">
                          {formatGameLabel(game)}
                        </div>
                        
                        {/* Hover/Touch Tooltip for Game Info */}
                        {(hoveredGame === game.id) && (
                          <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 z-30 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                            <div className="font-semibold">
                              {formatGameLabel(game)}
                            </div>
                            <div className="text-xs text-gray-300 mt-1">
                              {formatTime(game.startTime)} MST
                            </div>
                            {new Date(game.startTime) > now && (
                              <div className="text-xs text-green-300 mt-1 font-bold">
                                Starts in: {getCountdown(game.startTime)}
                              </div>
                            )}
                            {game.status === "InProgress" && (
                              <div className="text-xs text-red-300 mt-1 font-bold">
                                🔴 LIVE
                              </div>
                            )}
                            {game.status === "Final" && (
                              <div className="text-xs text-gray-300 mt-1">
                                ✅ FINAL
                              </div>
                            )}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                          </div>
                        )}
                      </th>
                    ))}
                    
                    {/* MNF columns - Scroll horizontally */}
                    <th className="border border-gray-300 p-3 font-bold text-gray-800 bg-purple-100 sticky top-0">MNF Pick</th>
                    <th className="border border-gray-300 p-3 font-bold text-gray-800 bg-purple-100 sticky top-0">Actual Total</th>
                    <th className="border border-gray-300 p-3 font-bold text-gray-800 bg-purple-100 sticky top-0">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Locked row */}
                  <tr className="bg-gray-200">
                    {/* Paid Column - NOT Sticky */}
                    <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-yellow-50">
                      -
                    </td>
                    
                    {/* Player Column - Sticky */}
                    <td className="border border-gray-300 p-3 font-semibold text-gray-800 sticky left-0 z-10 bg-gray-200">-</td>
                    
                    {/* Correct Column - NOT Sticky */}
                    <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-gray-200">-</td>
                    
                    {/* Percentage Column - NOT Sticky */}
                    <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-gray-200">-</td>
                    
                    {/* Game columns */}
                    {activeWeekGames.map((game) => {
                      const locked = isLocked(game.startTime);
                      return (
                        <td 
                          key={game.id} 
                          className="border border-gray-300 p-3 text-center relative"
                          onMouseEnter={() => setHoveredLockIndicator(game.id)}
                          onMouseLeave={() => setHoveredLockIndicator(null)}
                          onTouchStart={() => setHoveredLockIndicator(game.id)}
                        >
                          <div className="flex flex-col items-center justify-center">
                            <span
                              className={`inline-block w-4 h-4 rounded-full ${
                                locked ? "bg-red-600" : "bg-green-500"
                              }`}
                              title={locked ? "Game started / Pick locked" : "Pick available"}
                            ></span>
                            {locked && (
                              <div className="text-xs text-gray-600 mt-1">LOCKED</div>
                            )}
                          </div>
                          
                          {/* Hover/Touch Tooltip for Lock Indicator */}
                          {(hoveredLockIndicator === game.id) && (
                            <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 z-30 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                              <div className="font-semibold">
                                {formatGameLabel(game)}
                              </div>
                              <div className="text-xs text-gray-300 mt-1">
                                {formatTime(game.startTime)} MST
                              </div>
                              {locked ? (
                                <div className="text-xs text-red-300 mt-1 font-bold">
                                  🔒 Game started - Picks locked
                                </div>
                              ) : (
                                <div className="text-xs text-green-300 mt-1 font-bold">
                                  Starts in: {getCountdown(game.startTime)}
                                </div>
                              )}
                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                    
                    {/* MNF columns */}
                    <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-purple-50">-</td>
                    <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-purple-50">-</td>
                    <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-purple-50">-</td>
                  </tr>

                  {/* Player picks - ALL users who made picks */}
                  {sortedProfiles.map((user) => {
                    const stats = userStats[user.user_id] || {
                      correctPicks: 0,
                      totalPicks: 0,
                      percentage: 0,
                      mondayNightPick: null,
                      actualMondayTotal: null,
                      mondayNightDifference: null
                    };

                    const userPaidStatus = paidStatus[user.user_id] || false;
                    
                    // Determine winner status
                    const isPaidMostCorrect = bestPerformers.paidMostCorrect.includes(user.user_id);
                    const isUnpaidMostCorrect = bestPerformers.unpaidMostCorrect.includes(user.user_id);

                    const isWinner = isPaidMostCorrect || isUnpaidMostCorrect;
                    const isPaidWinner = isPaidMostCorrect;
                    const isUnpaidWinner = isUnpaidMostCorrect;

                    const mondayNightGame = activeWeekGames.find((game: Game) => game.is_monday_night);
                    const mondayNightLocked = mondayNightGame ? isLocked(mondayNightGame.startTime) : false;
                    const mondayNightFinal = mondayNightGame?.status === "Final";

                    // Determine background colors based on winner status
                    const getWinnerBackgroundColor = () => {
                      if (isPaidWinner) return "bg-green-100 border-green-300";
                      if (isUnpaidWinner) return "bg-orange-100 border-orange-300";
                      return "";
                    };

                    const getWinnerTextColor = () => {
                      if (isPaidWinner) return "text-green-900";
                      if (isUnpaidWinner) return "text-orange-900";
                      return "text-gray-800";
                    };

                    return (
                      <tr key={user.user_id} className={`hover:bg-gray-50 ${isWinner ? getWinnerBackgroundColor() : ''}`}>
                        {/* Paid Column - NOT Sticky */}
                        <td 
                          className={`border border-gray-300 p-3 text-center font-semibold ${
                            isWinner ? getWinnerBackgroundColor() + ' ' + getWinnerTextColor() : 'bg-yellow-50'
                          } ${
                            isAdmin && !updatingPaidStatus ? 'cursor-pointer hover:opacity-80 transition-colors' : ''
                          }`}
                          onClick={() => isAdmin && !updatingPaidStatus && setEditingPaidStatus(user.user_id)}
                        >
                          {updatingPaidStatus === user.user_id ? (
                            <div className="flex items-center justify-center">
                              <span className="text-gray-500">Updating...</span>
                            </div>
                          ) : editingPaidStatus === user.user_id ? (
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePaidStatus(user.user_id);
                                }}
                                className={`px-2 py-1 rounded text-white text-sm ${
                                  userPaidStatus ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                                }`}
                              >
                                {userPaidStatus ? 'Mark Unpaid' : 'Mark Paid'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingPaidStatus(null);
                                }}
                                className="px-2 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              {userPaidStatus ? (
                                <span className="text-green-600 text-xl" title="Paid">✓</span>
                              ) : (
                                <span className="text-red-500 text-xl" title="Not Paid">✗</span>
                              )}
                              {isAdmin && !updatingPaidStatus && (
                                <span className="text-xs text-gray-500">Click to edit</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Player name with hover/touch functionality - Sticky */}
                        <td 
                          className={`border border-gray-300 p-3 font-semibold relative sticky left-0 z-10 ${
                            isWinner ? getWinnerBackgroundColor() : 'bg-gray-50'
                          } text-gray-900`}
                          onMouseEnter={() => setHoveredUser(user.user_id)}
                          onMouseLeave={() => setHoveredUser(null)}
                          onTouchStart={() => setHoveredUser(user.user_id)}
                        >
                          <div className="cursor-default">
                            <span className="text-gray-900 font-bold">{user.username}</span>
                            {isPaidWinner && <div className="text-xs text-green-700 mt-1">🏆 Most Correct (Paid Winner)</div>}
                            {isUnpaidWinner && <div className="text-xs text-orange-700 mt-1">🥈 Most Correct (Would Have Won)</div>}
                          </div>
                          
                          {/* Hover/Touch Tooltip */}
                          {(hoveredUser === user.user_id) && (
                            <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 z-30 bg-gray-800 text-white text-sm px-3 py-2 rounded-lg shadow-lg whitespace-nowrap">
                              <div className="font-semibold">
                                {user.first_name} {user.last_name}
                              </div>
                              <div className="text-xs text-gray-300 mt-1">
                                {user.email}
                              </div>
                              <div className="text-xs text-gray-300 mt-1">
                                {userPaidStatus ? "Paid ✅" : "Not Paid ❌"}
                              </div>
                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
                            </div>
                          )}
                        </td>

                        {/* Correct picks - NOT Sticky */}
                          <td className={`border border-gray-300 p-3 font-semibold ${
                            isWinner ? getWinnerBackgroundColor() : 'bg-blue-50'
                          } text-gray-900`}>
                            {stats.correctPicks}/{stats.totalPicks}
                          </td>

                          {/* Percentage - NOT Sticky */}
                          <td className={`border border-gray-300 p-3 font-semibold ${
                            isWinner ? getWinnerBackgroundColor() : 'bg-blue-50'
                          } text-gray-900`}>
                            {stats.percentage}%
                          </td>

                        {/* Game picks - Scroll horizontally */}
                        {activeWeekGames.map((game: Game) => {
                          const locked = isLocked(game.startTime);
                          const userPick = picks.find(
                            (p) => p.user_id === user.user_id && p.game_id === game.id
                          );
                          
                          const showPick = locked;
                          const displayPick = showPick ? (userPick?.selected_team ?? "") : "❓";
                          
                          const isCorrect = game.status === "Final" && 
                                          userPick?.selected_team === game.winner;
                          
                          return (
                            <td
                              key={game.id}
                              className={`border border-gray-300 p-3 text-center font-medium ${
                                showPick 
                                  ? userPick 
                                    ? isCorrect
                                      ? "bg-green-100 text-green-900 border border-green-200"
                                      : "bg-red-100 text-red-900 border border-red-200"
                                    : "bg-red-100 text-red-900 border border-red-200"
                                  : "bg-gray-100 text-gray-600 border border-gray-200"
                              } ${isWinner ? getWinnerBackgroundColor() : ''}`}
                            >
                              {displayPick}
                              {game.is_monday_night && locked && userPick?.total_points !== null && userPick?.total_points !== undefined && (
                                <div className="text-xs text-purple-600 mt-1">
                                  Total: {userPick.total_points}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Monday night pick column */}
                        <td className={`border border-gray-300 p-3 font-semibold ${
                          isWinner ? getWinnerBackgroundColor() : 'bg-purple-50'
                        } text-gray-900`}>
                          {mondayNightLocked 
                            ? (stats.mondayNightPick !== null ? stats.mondayNightPick : "-") 
                            : "❓"
                          }
                        </td>

                        {/* Actual total column */}
                        <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-purple-50">
                          {mondayNightFinal && stats.actualMondayTotal !== null ? stats.actualMondayTotal : "-"}
                        </td>

                        {/* Difference column */}
                        <td className={`border border-gray-300 p-3 font-semibold ${
                          isWinner ? getWinnerBackgroundColor() : 'bg-purple-50'
                        } text-gray-900`}>
                          {mondayNightFinal && stats.mondayNightDifference !== null ? stats.mondayNightDifference : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center p-8 bg-gray-100 border border-gray-300 rounded-lg">
            <p className="text-lg text-gray-600">No games found for the selected week.</p>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-3 text-lg">How it works:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-3">
              <span className="inline-block w-4 h-4 rounded-full bg-green-500 border border-green-600"></span>
              <span className="text-gray-800 font-medium">Pick available (game hasn't started) - Hover for countdown</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-block w-4 h-4 rounded-full bg-red-600 border border-red-700"></span>
              <span className="text-gray-800 font-medium">Pick locked (game started) - Hover for details</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-green-600 text-xl">✓</span>
              <span className="text-gray-800 font-medium">Paid</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-red-500 text-xl">✗</span>
              <span className="text-gray-800 font-medium">Not paid</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-green-100 text-green-900 px-2 py-1 rounded border border-green-300 font-medium">🏆</span>
              <span className="text-gray-800 font-medium">Most correct picks (Paid winners - Green)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-orange-100 text-orange-900 px-2 py-1 rounded border border-orange-300 font-medium">🥈</span>
              <span className="text-gray-800 font-medium">Would have won (Unpaid winners - Orange)</span>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-3">
                <span className="bg-yellow-100 text-yellow-900 px-2 py-1 rounded border border-yellow-300 font-medium">Click</span>
                <span className="text-gray-800 font-medium">Admin: Click paid status to edit</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-gray-600 text-xl">❓</span>
              <span className="text-gray-800 font-medium">Pick hidden until game starts</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-green-100 text-green-900 px-2 py-1 rounded border border-green-300 font-medium">Team</span>
              <span className="text-gray-800 font-medium">Pick made</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-purple-100 text-purple-900 px-2 py-1 rounded border border-purple-300 font-medium">MNF</span>
              <span className="text-gray-800 font-medium">Monday Night Football</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-purple-600 text-xs">Total: XX</span>
              <span className="text-gray-800 font-medium">Monday night total (shown when final)</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-blue-600 font-medium">Hover/Click Game</span>
              <span className="text-gray-800 font-medium">See game time and countdown</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-blue-600 font-medium">Hover/Click Name</span>
              <span className="text-gray-800 font-medium">See user's first and last name</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-blue-600 font-medium">Hover Lock Indicator</span>
              <span className="text-gray-800 font-medium">See countdown or lock status</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AllPicksPage;