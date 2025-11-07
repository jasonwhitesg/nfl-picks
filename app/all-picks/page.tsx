"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

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
  email: string;
};

type UserStats = {
  correctPicks: number;
  totalPicks: number;
  percentage: number;
  mondayNightPick: number | null;
  actualMondayTotal: number | null;
  mondayNightDifference: number | null;
};

const AllPicksPage = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [now, setNow] = useState(new Date());
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});
  const [bestPerformers, setBestPerformers] = useState<{
    mostCorrect: string[];
    closestMonday: string[];
  }>({ mostCorrect: [], closestMonday: [] });

  // Get current time in MST (same as MakePicksPage)
  function getNowMST(): Date {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Denver" })
    );
  }

  // ---------- Fetch all data ----------
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id, email");
        setProfiles(profileData || []);

        const { data: gameData } = await supabase.from("games").select("*");
        
        // FILTER OUT BYE WEEK GAMES - same as MakePicksPage
        const filteredGameData = (gameData || []).filter((g: any) => 
          g.team_a && g.team_b && 
          g.team_a.trim() !== '' && g.team_b.trim() !== '' &&
          g.team_a.toLowerCase() !== 'bye' && g.team_b.toLowerCase() !== 'bye'
        );

        // Convert UTC times to MST (same as MakePicksPage)
        const mappedGames: Game[] = filteredGameData.map((g: any) => {
          // Convert UTC time to MST (subtract 7 hours for UTC to MST)
          const utcDate = new Date(g.start_time);
          const mstDate = new Date(utcDate.getTime() - 7 * 60 * 60 * 1000); // UTC → MST

          return {
            id: g.id,
            week: g.week,
            startTime: mstDate.toISOString(), // Store as MST
            homeTeam: g.team_b,
            awayTeam: g.team_a,
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

        // Use MST for current week calculation
        const nowMST = getNowMST();
        
        // Find the current week based on games that haven't started yet
        const weekNumbers = Array.from(new Set(sortedGames.map((g) => g.week))).sort((a, b) => a - b);
        
        // Find the first week that has games in the future
        const upcomingWeek = weekNumbers.find(week => {
          const weekGames = sortedGames.filter(g => g.week === week);
          return weekGames.some(game => new Date(game.startTime) > nowMST);
        });

        // If no upcoming games, use the latest week
        const currentWeek = upcomingWeek ?? Math.max(...weekNumbers);
        
        setActiveWeek(currentWeek);
        setLoading(false);
      } catch (err) {
        console.error("Error loading All Picks:", err);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ---------- Calculate user stats and best performers ----------
  useEffect(() => {
    if (games.length === 0 || picks.length === 0 || profiles.length === 0 || !activeWeek) return;

    const stats: Record<string, UserStats> = {};
    let maxCorrectPicks = 0;
    let minMondayDifference = Infinity;
    const usersWithMaxCorrect: string[] = [];
    const usersWithClosestMonday: string[] = [];

    profiles.forEach(profile => {
      const userPicks = picks.filter(pick => pick.user_id === profile.user_id);
      const weekGames = games.filter(game => game.week === activeWeek);
      
      // Calculate correct picks for completed games
      const completedGames = weekGames.filter(game => 
        game.status === "Final" && game.winner !== null
      );
      
      let correctPicks = 0;
      let totalPicks = 0;

      completedGames.forEach(game => {
        const userPick = userPicks.find(p => p.game_id === game.id);
        if (userPick) {
          totalPicks++;
          if (userPick.selected_team === game.winner) {
            correctPicks++;
          }
        }
      });

      const percentage = totalPicks > 0 ? Math.round((correctPicks / totalPicks) * 100) : 0;

      // Find Monday night game data with proper null handling
      const mondayNightGame = weekGames.find(game => game.is_monday_night);
      const mondayNightPickValue = userPicks.find(p => p.game_id === mondayNightGame?.id)?.total_points;
      const actualMondayTotalValue = mondayNightGame?.actual_total_points;
      
      // Convert undefined to null for type safety
      const mondayNightPick = mondayNightPickValue !== undefined ? mondayNightPickValue : null;
      const actualMondayTotal = actualMondayTotalValue !== undefined ? actualMondayTotalValue : null;
      
      let mondayNightDifference = null;
      if (mondayNightPick !== null && actualMondayTotal !== null) {
        mondayNightDifference = Math.abs(mondayNightPick - actualMondayTotal);
      }

      stats[profile.user_id] = {
        correctPicks,
        totalPicks,
        percentage,
        mondayNightPick,
        actualMondayTotal,
        mondayNightDifference
      };

      // Track best performers
      if (correctPicks > maxCorrectPicks) {
        maxCorrectPicks = correctPicks;
      }
      if (mondayNightDifference !== null && mondayNightDifference < minMondayDifference) {
        minMondayDifference = mondayNightDifference;
      }
    });

    // Find users with max correct picks and closest Monday night picks
    profiles.forEach(profile => {
      const userStat = stats[profile.user_id];
      if (userStat.correctPicks === maxCorrectPicks && maxCorrectPicks > 0) {
        usersWithMaxCorrect.push(profile.user_id);
      }
      if (userStat.mondayNightDifference === minMondayDifference && minMondayDifference !== Infinity) {
        usersWithClosestMonday.push(profile.user_id);
      }
    });

    setUserStats(stats);
    setBestPerformers({
      mostCorrect: usersWithMaxCorrect,
      closestMonday: usersWithClosestMonday
    });
  }, [games, picks, profiles, activeWeek]);

  // ---------- Timer (needed for locked games) ----------
  useEffect(() => {
    const interval = setInterval(() => setNow(getNowMST()), 1000); // Use MST time
    return () => clearInterval(interval);
  }, []);

  const isLocked = (isoDate: string) => {
    const gameTime = new Date(isoDate); // This is already in MST
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
    const hasLiveGames = weekGames.some(game => {
      const gameTime = new Date(game.startTime);
      const threeHoursLater = new Date(gameTime.getTime() + 3 * 60 * 60 * 1000);
      return now >= gameTime && now <= threeHoursLater;
    });

    if (hasUpcomingGames) return `Week ${activeWeek} (Current)`;
    if (hasLiveGames) return `Week ${activeWeek} (Live)`;
    return `Week ${activeWeek} (Completed)`;
  };

  // Get games for active week with null safety
  const getActiveWeekGames = () => {
    if (!activeWeek || !gamesByWeek[activeWeek]) return [];
    return gamesByWeek[activeWeek];
  };

  if (loading) return <div className="p-6 text-lg">Loading all picks...</div>;

  const activeWeekGames = getActiveWeekGames();

  return (
    <div className="p-6 max-w-7xl mx-auto bg-white min-h-screen">
      {/* Header with Home and Make Picks links */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link 
            href="/" 
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors font-semibold"
          >
            Home
          </Link>
          <Link 
            href="/make-picks" 
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors font-semibold"
          >
            Make Picks
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-gray-800">All Player Picks</h1>
      </div>

      {/* Current Week Display */}
      {activeWeek && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-xl font-semibold text-blue-800">
            {getCurrentWeekDisplay()}
          </h2>
        </div>
      )}

      {/* Week tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {Object.keys(gamesByWeek).map((week) => {
          const weekNum = Number(week);
          const weekGames = gamesByWeek[weekNum] || [];
          const hasUpcomingGames = weekGames.some(game => new Date(game.startTime) > now);
          const isCurrentWeek = activeWeek === weekNum;
          
          return (
            <button
              key={week}
              onClick={() => setActiveWeek(weekNum)}
              className={`px-4 py-2 rounded font-semibold transition-colors min-w-[100px] ${
                isCurrentWeek 
                  ? "bg-blue-600 text-white border-2 border-blue-700" 
                  : hasUpcomingGames 
                    ? "bg-green-100 text-green-800 border border-green-300 hover:bg-green-200"
                    : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
              }`}
            >
              Week {week}
              {hasUpcomingGames && " ⏱️"}
            </button>
          );
        })}
      </div>

      {activeWeek && activeWeekGames.length > 0 ? (
        <div className="overflow-x-auto border border-gray-300 rounded-lg">
          <table className="table-auto border-collapse w-full text-center">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-3 font-bold text-gray-800">Player</th>
                <th className="border border-gray-300 p-3 font-bold text-gray-800">Correct</th>
                <th className="border border-gray-300 p-3 font-bold text-gray-800">%</th>
                {activeWeekGames.map((game) => (
                  <th key={game.id} className="border border-gray-300 p-3 font-bold text-gray-800">
                    {formatGameLabel(game)}
                    <div className="text-xs font-normal text-gray-600 mt-1">
                      {formatTime(game.startTime)} MST
                    </div>
                  </th>
                ))}
                <th className="border border-gray-300 p-3 font-bold text-gray-800 bg-purple-100">MNF Pick</th>
                <th className="border border-gray-300 p-3 font-bold text-gray-800 bg-purple-100">Actual Total</th>
                <th className="border border-gray-300 p-3 font-bold text-gray-800 bg-purple-100">Difference</th>
              </tr>
            </thead>
            <tbody>
              {/* Locked row */}
              <tr className="bg-gray-200">
                <td className="border border-gray-300 p-3 font-semibold text-gray-800">Locked</td>
                <td className="border border-gray-300 p-3 font-semibold text-gray-800">-</td>
                <td className="border border-gray-300 p-3 font-semibold text-gray-800">-</td>
                {activeWeekGames.map((game) => {
                  const locked = isLocked(game.startTime);
                  return (
                    <td key={game.id} className="border border-gray-300 p-3 text-center">
                      <span
                        className={`inline-block w-4 h-4 rounded-full ${
                          locked ? "bg-red-600" : "bg-green-500"
                        }`}
                        title={locked ? "Game started / Pick locked" : "Pick available"}
                      ></span>
                      {locked && (
                        <div className="text-xs text-gray-600 mt-1">LOCKED</div>
                      )}
                    </td>
                  );
                })}
                <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-purple-50">-</td>
                <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-purple-50">-</td>
                <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-purple-50">-</td>
              </tr>

              {/* Player picks */}
              {profiles.map((user) => {
                const stats = userStats[user.user_id] || {
                  correctPicks: 0,
                  totalPicks: 0,
                  percentage: 0,
                  mondayNightPick: null,
                  actualMondayTotal: null,
                  mondayNightDifference: null
                };

                const isMostCorrect = bestPerformers.mostCorrect.includes(user.user_id);
                const isClosestMonday = bestPerformers.closestMonday.includes(user.user_id);

                // Find Monday night game for this week
                const mondayNightGame = activeWeekGames.find((game: Game) => game.is_monday_night);
                const mondayNightLocked = mondayNightGame ? isLocked(mondayNightGame.startTime) : false;
                const mondayNightFinal = mondayNightGame?.status === "Final";

                return (
                  <tr key={user.user_id} className="hover:bg-gray-50">
                    {/* Player name with highlighting */}
                    <td className={`border border-gray-300 p-3 font-semibold ${
                      isMostCorrect || isClosestMonday 
                        ? "bg-green-100 text-green-900 border-green-300" 
                        : "bg-gray-50 text-gray-800"
                    }`}>
                      {user.email}
                      {(isMostCorrect || isClosestMonday) && (
                        <div className="text-xs text-green-700 mt-1">
                          {isMostCorrect && "🏆 Most Correct "}
                          {isClosestMonday && "🎯 Closest MNF"}
                        </div>
                      )}
                    </td>

                    {/* Correct picks with highlighting */}
                    <td className={`border border-gray-300 p-3 font-semibold ${
                      isMostCorrect 
                        ? "bg-green-100 text-green-900 border-green-300" 
                        : "bg-blue-50 text-gray-800"
                    }`}>
                      {stats.correctPicks}/{stats.totalPicks}
                    </td>

                    {/* Percentage with highlighting */}
                    <td className={`border border-gray-300 p-3 font-semibold ${
                      isMostCorrect 
                        ? "bg-green-100 text-green-900 border-green-300" 
                        : "bg-blue-50 text-gray-800"
                    }`}>
                      {stats.percentage}%
                    </td>

                    {/* Game picks */}
                    {activeWeekGames.map((game: Game) => {
                      const locked = isLocked(game.startTime);
                      const userPick = picks.find(
                        (p) => p.user_id === user.user_id && p.game_id === game.id
                      );
                      
                      // Show pick if game is locked
                      const showPick = locked;
                      const displayPick = showPick ? (userPick?.selected_team ?? "") : "❓";
                      
                      // Check if pick is correct (only for completed games)
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
                          }`}
                        >
                          {displayPick}
                          {/* Only show Monday night total when game is locked AND has total points */}
                          {game.is_monday_night && locked && userPick?.total_points !== null && userPick?.total_points !== undefined && (
                            <div className="text-xs text-purple-600 mt-1">
                              Total: {userPick.total_points}
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Monday night pick column - show ? until game starts, then show number */}
                    <td className={`border border-gray-300 p-3 font-semibold ${
                      isClosestMonday 
                        ? "bg-green-100 text-green-900 border-green-300" 
                        : "bg-purple-50 text-gray-800"
                    }`}>
                      {mondayNightLocked 
                        ? (stats.mondayNightPick !== null ? stats.mondayNightPick : "-") 
                        : "❓"
                      }
                    </td>
                    
                    {/* Actual total column - only show when game is final */}
                    <td className="border border-gray-300 p-3 font-semibold text-gray-800 bg-purple-50">
                      {mondayNightFinal && stats.actualMondayTotal !== null ? stats.actualMondayTotal : "-"}
                    </td>
                    
                    {/* Difference column - only show when game is final */}
                    <td className={`border border-gray-300 p-3 font-semibold ${
                      isClosestMonday 
                        ? "bg-green-100 text-green-900 border-green-300" 
                        : "bg-purple-50 text-gray-800"
                    }`}>
                      {mondayNightFinal && stats.mondayNightDifference !== null ? stats.mondayNightDifference : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
            <span className="text-gray-800 font-medium">Pick available (game hasn't started)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-block w-4 h-4 rounded-full bg-red-600 border border-red-700"></span>
            <span className="text-gray-800 font-medium">Pick locked (game started)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-600 text-xl">❓</span>
            <span className="text-gray-800 font-medium">Pick hidden until game starts</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-green-100 text-green-900 px-2 py-1 rounded border border-green-300 font-medium">Team</span>
            <span className="text-gray-800 font-medium">Pick made</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-green-100 text-green-900 px-2 py-1 rounded border border-green-300 font-medium">🏆</span>
            <span className="text-gray-800 font-medium">Most correct picks this week</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-green-100 text-green-900 px-2 py-1 rounded border border-green-300 font-medium">🎯</span>
            <span className="text-gray-800 font-medium">Closest Monday night pick</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-purple-100 text-purple-900 px-2 py-1 rounded border border-purple-300 font-medium">MNF</span>
            <span className="text-gray-800 font-medium">Monday Night Football</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-purple-600 text-xs">Total: XX</span>
            <span className="text-gray-800 font-medium">Monday night total (shown when final)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AllPicksPage;