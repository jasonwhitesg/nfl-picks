"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Game = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  start_time: string;
  week: number;
  home_score?: number | null;
  away_score?: number | null;
  winner?: string | null;
  status?: string | null;
  is_monday_night?: boolean;
  actual_total_points?: number | null;
};

type Picks = Record<string, string | null>;
type MondayNightTotals = Record<string, number | null>;

const MakePicksPage = () => {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Picks>({});
  const [now, setNow] = useState<Date>(new Date());
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mondayNightTotals, setMondayNightTotals] = useState<MondayNightTotals>({});
  const [savingScore, setSavingScore] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [userSelectedWeek, setUserSelectedWeek] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [debugActive, setDebugActive] = useState(false); // NEW: Control debug logging

  const addDebugInfo = (message: string) => {
    if (!debugActive) return; // NEW: Only log if debug is active
    console.log(`[DEBUG] ${message}`);
    setDebugInfo(prev => [...prev.slice(-19), `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // Update now every second for real-time countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/login");
        return;
      }
      setUserEmail(data.session.user.email || null);
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("user_id, is_admin")
        .eq("email", data.session.user.email)
        .single();
      if (!error) {
        setUserId(profile.user_id);
        setIsAdmin(profile.is_admin || false);
      }
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    
    const fetchPicksAndTotals = async () => {
      const { data, error } = await supabase
        .from("game_picks")
        .select("game_id, selected_team, total_points")
        .eq("user_id", userId);

      if (!error && data) {
        const picksMap: Picks = {};
        const totalsMap: MondayNightTotals = {};
        
        data.forEach((p: any) => {
          picksMap[p.game_id] = p.selected_team;
          if (p.total_points !== null) {
            totalsMap[p.game_id] = p.total_points;
          }
        });
        
        setPicks(picksMap);
        setMondayNightTotals(totalsMap);
        addDebugInfo(`Loaded ${data.length} picks for user`);
      }
    };
    
    fetchPicksAndTotals();
  }, [userId]);

  const fetchGames = async (forceRefresh = false) => {
    addDebugInfo(`Fetching games from database... ${forceRefresh ? '(FORCED)' : ''}`);
    
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .order("start_time", { ascending: true });

    if (error) {
      addDebugInfo(`❌ Error fetching games: ${error.message}`);
      return;
    }

    // Filter out any games with null teams or bye weeks
    const filteredData = data.filter((g: any) => 
      g.team_a && g.team_b && 
      g.team_a.trim() !== '' && g.team_b.trim() !== '' &&
      g.team_a.toLowerCase() !== 'bye' && g.team_b.toLowerCase() !== 'bye'
    );

    addDebugInfo(`📊 Found ${filteredData.length} games after filtering`);

    const mapped: Game[] = filteredData.map((g: any) => {
      let status = g.status;
      let winner = g.winner;
      
      // Convert UTC time to MST (subtract 7 hours for UTC to MST)
      const utcDate = new Date(g.start_time);
      const mstDate = new Date(utcDate.getTime() - 7 * 60 * 60 * 1000);

      // Determine game status and winner if not already set
      if (!status) {
        if (g.home_score != null && g.away_score != null) {
          status = "Final";
          winner = g.home_score > g.away_score ? g.team_a : g.team_b;
        } else if (utcDate <= now) {
          status = "InProgress";
        } else {
          status = "Scheduled";
        }
      }

      return {
        id: g.id,
        week: g.week,
        homeTeam: g.team_a,
        awayTeam: g.team_b,
        start_time: mstDate.toISOString(),
        home_score: g.home_score,
        away_score: g.away_score,
        winner,
        status,
        is_monday_night: g.is_monday_night,
        actual_total_points: g.actual_total_points,
      };
    });

    setGames(mapped);

    // Only auto-update the active week if user hasn't manually selected one
    if (!userSelectedWeek) {
      // Find the upcoming week
      const upcomingWeek = [...new Set(mapped.map((g) => g.week))]
        .sort((a, b) => a - b)
        .find((w) =>
          mapped.some(
            (g) => g.week === w && new Date(g.start_time) > now
          )
        );

      const newActiveWeek = upcomingWeek ?? Math.max(...mapped.map((g) => g.week));
      setActiveWeek(newActiveWeek);
      addDebugInfo(`📅 Auto-setting active week: ${newActiveWeek} (userSelected: ${userSelectedWeek})`);
    } else {
      addDebugInfo(`📅 Keeping user-selected week: ${activeWeek}`);
    }

    // Detailed debug for Week 10
    const week10Games = mapped.filter(g => g.week === 10);
    addDebugInfo(`🔍 Week 10 games: ${week10Games.length} total`);
    
    week10Games.forEach(g => {
      const scoreInfo = g.home_score !== null && g.away_score !== null 
        ? `${g.away_score}-${g.home_score}` 
        : 'null-null';
      addDebugInfo(`🏈 ${g.awayTeam} @ ${g.homeTeam}: ${scoreInfo} - ${g.status}`);
    });

    // Check LV @ DEN specifically
    const lvDenGame = week10Games.find(g => g.awayTeam === 'LV' && g.homeTeam === 'DEN');
    if (lvDenGame) {
      addDebugInfo(`🎯 LV@DEN DETAIL: home_score=${lvDenGame.home_score}, away_score=${lvDenGame.away_score}, status=${lvDenGame.status}`);
    }
  };

  useEffect(() => {
    fetchGames();
    const interval = setInterval(() => fetchGames(), 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [now]);

  // Handle week selection
  const handleWeekSelect = (week: number) => {
    setUserSelectedWeek(true); // Mark that user manually selected a week
    setActiveWeek(week);
    addDebugInfo(`🎯 User manually selected week: ${week}`);
  };

  // Reset user selection when component mounts or when we want to go back to auto-selection
  useEffect(() => {
    // Reset user selection when component first loads
    setUserSelectedWeek(false);
  }, []);

  // NEW: Toggle debug logging
  const toggleDebugActive = () => {
    setDebugActive(!debugActive);
    addDebugInfo(`Debug logging ${!debugActive ? 'STARTED' : 'STOPPED'}`);
  };

  // Debug functions - Only allow if admin
  const checkSpecificGame = async () => {
    if (!isAdmin) return;
    addDebugInfo("🔎 Checking LV @ DEN game in database...");
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("team_a", "LV")
      .eq("team_b", "DEN")
      .eq("week", 10);

    if (error) {
      addDebugInfo(`❌ Error checking LV@DEN: ${error.message}`);
    } else if (data && data.length > 0) {
      const game = data[0];
      addDebugInfo(`✅ LV@DEN FOUND: home_score=${game.home_score}, away_score=${game.away_score}, status=${game.status}, winner=${game.winner}`);
    } else {
      addDebugInfo("❌ LV@DEN game not found in database!");
    }
  };

  const runScoreUpdate = async () => {
    if (!isAdmin) return;
    addDebugInfo("🔄 Manually triggering score update...");
    try {
      const response = await fetch('/api/update-scores');
      const result = await response.json();
      addDebugInfo(`✅ API Response: ${JSON.stringify(result)}`);
      
      // Refresh games after update
      setTimeout(() => fetchGames(true), 2000);
    } catch (error) {
      addDebugInfo(`❌ API Error: ${error}`);
    }
  };

  const checkAllWeek10Games = async () => {
    if (!isAdmin) return;
    addDebugInfo("🔍 Checking ALL Week 10 games...");
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("week", 10)
      .order("start_time");

    if (error) {
      addDebugInfo(`❌ Error checking Week 10: ${error.message}`);
    } else if (data) {
      addDebugInfo(`📋 Week 10 games in DB: ${data.length}`);
      data.forEach(game => {
        addDebugInfo(`   ${game.team_a} @ ${game.team_b}: ${game.home_score}-${game.away_score} - ${game.status}`);
      });
    }
  };

  const runSQLQueries = async () => {
    if (!isAdmin) return;
    addDebugInfo("🔍 Running SQL diagnostics...");
    
    // Query 1: Check LV @ DEN specifically
    const { data: lvDen, error: error1 } = await supabase
      .from("games")
      .select("*")
      .eq("team_a", "LV")
      .eq("team_b", "DEN")
      .eq("week", 10);

    if (error1) {
      addDebugInfo(`❌ LV@DEN query error: ${error1.message}`);
    } else {
      addDebugInfo(`✅ LV@DEN found: ${lvDen?.length || 0} games`);
      lvDen?.forEach(game => {
        addDebugInfo(`   ID: ${game.id}, Scores: ${game.home_score}-${game.away_score}, Status: ${game.status}`);
      });
    }

    // Query 2: Check all Week 10 games
    const { data: week10, error: error2 } = await supabase
      .from("games")
      .select("id, team_a, team_b, home_score, away_score, status")
      .eq("week", 10)
      .order("start_time");

    if (error2) {
      addDebugInfo(`❌ Week 10 query error: ${error2.message}`);
    } else {
      addDebugInfo(`📋 Week 10 games: ${week10?.length || 0} total`);
      week10?.forEach(game => {
        addDebugInfo(`   ${game.team_a} @ ${game.team_b}: ${game.home_score}-${game.away_score} - ${game.status}`);
      });
    }

    // Query 3: Check the specific game by ID
    const { data: specificGame, error: error3 } = await supabase
      .from("games")
      .select("*")
      .eq("id", "202511010");

    if (error3) {
      addDebugInfo(`❌ Specific game query error: ${error3.message}`);
    } else {
      addDebugInfo(`🎯 Game 202511010: ${specificGame?.length || 0} found`);
      specificGame?.forEach(game => {
        addDebugInfo(`   ${game.team_a} @ ${game.team_b}: ${game.home_score}-${game.away_score} - ${game.status} - Week: ${game.week}`);
      });
    }
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

  const getCountdown = (iso: string) => {
    const gameTime = new Date(iso);
    const diff = gameTime.getTime() - now.getTime();
    if (diff <= 0) return "Game started";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    const secs = Math.floor((diff / 1000) % 60);
    return `${hours}h ${mins}m ${secs}s`;
  };

  const isLocked = (isoDate: string) => {
    const gameTime = new Date(isoDate);
    return now >= gameTime;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const selectPick = async (gameId: string, team: string, lockTime: string) => {
    if (isLocked(lockTime)) {
      alert("This game is locked. You cannot change your pick.");
      return;
    }

    setPicks((prev) => ({ ...prev, [gameId]: team }));

    if (!userId) return;

    try {
      const { error } = await supabase
        .from("game_picks")
        .upsert({
          user_id: userId,
          game_id: gameId,
          selected_team: team,
          lock_time: lockTime,
          is_locked: false,
          total_points: mondayNightTotals[gameId] || null
        }, {
          onConflict: 'user_id,game_id'
        });

      if (error) {
        console.error("Error saving pick:", error);
        setPicks((prev) => ({ ...prev, [gameId]: picks[gameId] }));
        alert("Error saving your pick. Please try again.");
      } else {
        addDebugInfo(`✅ Pick saved: ${team} for game ${gameId}`);
      }
    } catch (err) {
      console.error("Error saving pick:", err);
      setPicks((prev) => ({ ...prev, [gameId]: picks[gameId] }));
      alert("Error saving your pick. Please try again.");
    }
  };

  const updateMondayNightTotal = async (gameId: string, totalPoints: number | null) => {
    if (!userId) return;
    
    setSavingScore(gameId);

    try {
      const { error } = await supabase
        .from("game_picks")
        .update({ total_points: totalPoints })
        .eq("user_id", userId)
        .eq("game_id", gameId);

      if (error) {
        console.error("Error saving total score:", error);
        alert("Error saving total score. Please try again.");
      } else {
        setMondayNightTotals(prev => ({
          ...prev,
          [gameId]: totalPoints
        }));
        addDebugInfo(`✅ Total points updated: ${totalPoints} for game ${gameId}`);
      }
    } catch (err) {
      console.error("Error saving total score:", err);
      alert("Error saving total score. Please try again.");
    } finally {
      setSavingScore(null);
    }
  };

  const handleMondayNightTotalChange = async (gameId: string, value: number | null) => {
    if (!userId) return;
    
    setMondayNightTotals(prev => ({
      ...prev,
      [gameId]: value
    }));

    if (picks[gameId]) {
      try {
        const { error } = await supabase
          .from("game_picks")
          .update({ total_points: value })
          .eq("user_id", userId)
          .eq("game_id", gameId);

        if (error) {
          console.error("Error saving total score:", error);
          alert("Error saving total score. Please try again.");
          setMondayNightTotals(prev => ({
            ...prev,
            [gameId]: mondayNightTotals[gameId]
          }));
        } else {
          addDebugInfo(`✅ Total points saved: ${value} for game ${gameId}`);
        }
      } catch (err) {
        console.error("Error saving total score:", err);
        alert("Error saving total score. Please try again.");
        setMondayNightTotals(prev => ({
          ...prev,
          [gameId]: mondayNightTotals[gameId]
        }));
      }
    }
  };

  const gamesByWeek: Record<number, Game[]> = {};
  games.forEach((g) => {
    if (!gamesByWeek[g.week]) gamesByWeek[g.week] = [];
    gamesByWeek[g.week].push(g);
  });

  if (loading) return <div>Loading...</div>;

  const maxWeek = Math.max(...games.map((g) => g.week));
  const currentWeekNum = activeWeek ?? 1;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link 
            href="/" 
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors"
          >
            Home
          </Link>
          <h1 className="text-3xl font-bold">NFL Weekly Picks</h1>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Link 
            href="/all-picks" 
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
          >
            View All Picks
          </Link>
          
          {/* Debug Buttons - Only show if debug panel is visible AND user is admin */}
          {showDebug && isAdmin && (
            <>
              <button
                onClick={() => fetchGames(true)}
                className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 transition-colors"
              >
                Refresh Scores
              </button>
              <button
                onClick={runScoreUpdate}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
              >
                Update Scores API
              </button>
              <button
                onClick={checkSpecificGame}
                className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 transition-colors"
              >
                Check LV@DEN
              </button>
              <button
                onClick={checkAllWeek10Games}
                className="bg-indigo-500 text-white px-4 py-2 rounded hover:bg-indigo-600 transition-colors"
              >
                Check All Week 10
              </button>
              <button
                onClick={runSQLQueries}
                className="bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600 transition-colors"
              >
                Run SQL Diagnostics
              </button>
              {/* NEW: Start/Stop Debug Logging Button */}
              <button
                onClick={toggleDebugActive}
                className={`px-4 py-2 rounded transition-colors ${
                  debugActive 
                    ? 'bg-red-500 text-white hover:bg-red-600' 
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                {debugActive ? 'Stop Debug Logging' : 'Start Debug Logging'}
              </button>
            </>
          )}
          
          {/* Show debug toggle button - Only show for admin users */}
          {isAdmin && (
            <button
              onClick={() => setShowDebug(!showDebug)}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors"
            >
              {showDebug ? 'Hide Debug' : 'Show Debug'}
            </button>
          )}
          
          {userEmail && <span className="text-gray-700">{userEmail}</span>}
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Debug Info Panel - Only show when debug is enabled AND user is admin */}
      {showDebug && isAdmin && (
        <div className="mb-6 p-4 bg-gray-100 border border-gray-300 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-lg">Debug Info (Make Picks)</h3>
            <div className="flex gap-2">
              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                debugActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {debugActive ? '🔴 LOGGING ACTIVE' : '⚫ LOGGING INACTIVE'}
              </span>
              <button
                onClick={() => setDebugInfo([])}
                className="text-sm bg-gray-500 text-white px-2 py-1 rounded"
              >
                Clear Debug
              </button>
            </div>
          </div>
          <div className="text-sm font-mono max-h-64 overflow-y-auto bg-black text-green-400 p-3 rounded">
            {debugInfo.length === 0 ? (
              <div className="text-gray-500">
                {debugActive 
                  ? 'No debug info yet. Actions will be logged here.' 
                  : 'Debug logging is inactive. Click "Start Debug Logging" to begin.'}
              </div>
            ) : (
              debugInfo.map((info, index) => (
                <div key={index} className="border-b border-gray-700 py-1">
                  {info}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Week Tabs */}
      <div className="overflow-x-auto mb-8">
        <div className="flex gap-2 min-w-max px-2 pb-2">
          {Array.from({ length: maxWeek }, (_, i) => i + 1).map((week) => {
            const isActive = activeWeek === week;
            const isCompleted = week < currentWeekNum;

            const color = isActive
              ? "bg-green-500 text-white"
              : "bg-blue-500 text-white hover:bg-blue-600";

            return (
              <button
                key={week}
                onClick={() => handleWeekSelect(week)}
                className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-1 transition-all ${color}`}
              >
                Week {week}
                {isCompleted && (
                  <span className="text-white font-bold">✔</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Games */}
      {activeWeek &&
        gamesByWeek[activeWeek]?.map((g) => {
          const locked = isLocked(g.start_time);
          const pick = picks[g.id];
          const isFinal = g.status === "Final";
          const isLive = g.status === "InProgress";
          const isMondayNight = g.is_monday_night;
          const userHasSetTotal = mondayNightTotals[g.id] !== null;
          const actualTotal = g.home_score != null && g.away_score != null ? g.home_score + g.away_score : null;

          const pickCorrect = isFinal && pick ? (pick === g.winner ? true : false) : null;

          const teamBtn = (team: string) => {
            let base = "px-4 py-2 rounded-md font-semibold transition-all text-center min-w-[80px]";

            if (pick === team && !isFinal) {
              base += " bg-blue-500 text-white";
            }

            if (pick === team && isFinal) {
              base += pickCorrect
                ? " bg-green-500 text-white"
                : " bg-red-500 text-white";
            }

            if (locked && pick !== team) {
              base += " bg-gray-100 text-gray-500 cursor-not-allowed";
            }

            return base;
          };

          return (
            <div
              key={g.id}
              className="border-2 border-gray-300 rounded-xl p-6 mb-6 flex flex-col gap-4 
                        transition-all duration-300 max-w-2xl mx-auto w-full
                        bg-white shadow-lg
                        hover:shadow-2xl hover:-translate-y-1 hover:border-blue-200
                        transform-gpu"
              style={{
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
              }}
            >
              {/* Top section: Game info - Centered */}
              <div className="flex flex-col items-center text-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="font-bold text-xl sm:text-2xl truncate text-gray-800">
                    {g.awayTeam} @ {g.homeTeam}
                  </div>
                  {isMondayNight && (
                    <span className="bg-purple-500 text-white px-2 py-1 rounded text-xs font-bold">
                      MNF
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`font-semibold text-lg ${
                      isLive 
                        ? "text-green-600" 
                        : isFinal 
                        ? "text-gray-800"
                        : "text-blue-600"
                    }`}
                  >
                    {isFinal ? "FINAL" : isLive ? "LIVE" : "UPCOMING"}
                  </div>

                  <div className="text-sm text-gray-600 font-medium">
                    {formatTime(g.start_time)} MST
                  </div>
                </div>

                {/* Show final score if game is completed */}
                {isFinal && g.home_score !== null && g.away_score !== null && (
                  <div className="bg-gray-100 rounded-lg px-4 py-2 mt-2">
                    <div className="font-bold text-lg text-gray-800">
                      Final: {g.awayTeam} {g.away_score} - {g.homeTeam} {g.home_score}
                    </div>
                    {g.winner && (
                      <div className="text-sm font-semibold text-green-600 mt-1">
                        Winner: {g.winner}
                      </div>
                    )}
                    {isMondayNight && (
                      <div className="text-sm font-semibold text-purple-600 mt-1">
                        Actual Total Points: <span className="text-lg font-bold text-purple-800">{actualTotal}</span>
                        {userHasSetTotal && (
                          <span className="text-gray-800 ml-2 font-medium">
                            (Your pick: <span className="text-lg font-bold text-purple-800">{mondayNightTotals[g.id]}</span>)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Monday Night Total Points Input - Only show before game starts */}
                {isMondayNight && !isFinal && !locked && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mt-2 w-full">
                    <div className="text-sm font-semibold text-purple-800 mb-3 text-center">
                      Set Monday Night Total Points (Locks when game starts)
                    </div>
                    <div className="flex justify-center items-center gap-3">
                      <div className="flex flex-col items-center gap-2">
                        <label className="text-sm font-medium text-gray-700">Total Points</label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={mondayNightTotals[g.id] ?? ''}
                          onChange={(e) => handleMondayNightTotalChange(g.id, e.target.value ? parseInt(e.target.value) : null)}
                          className="w-24 px-3 py-2 border-2 border-purple-300 rounded text-center font-bold text-lg text-purple-800 bg-white"
                          placeholder="0"
                          disabled={savingScore === g.id}
                          style={{
                            fontSize: '1.125rem',
                            fontWeight: 'bold',
                            color: '#1e1b4b'
                          }}
                        />
                      </div>
                    </div>
                    {userHasSetTotal && (
                      <div className="text-sm font-semibold text-purple-800 text-center mt-2">
                        Total points set: <span className="text-lg font-bold">{mondayNightTotals[g.id]}</span> (will lock when game starts)
                      </div>
                    )}
                    {savingScore === g.id && (
                      <div className="text-xs text-purple-600 text-center mt-2">
                        Saving...
                      </div>
                    )}
                  </div>
                )}

                {/* Show locked total when game starts but isn't final yet */}
                {isMondayNight && !isFinal && locked && userHasSetTotal && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-2 w-full">
                    <div className="text-sm font-semibold text-yellow-800 text-center">
                      Total Points Locked: <span className="text-lg font-bold text-yellow-900">{mondayNightTotals[g.id]}</span>
                    </div>
                    <div className="text-xs text-yellow-600 text-center mt-1">
                      Waiting for final score...
                    </div>
                  </div>
                )}

                {/* Show when no total was set before game started */}
                {isMondayNight && !isFinal && locked && !userHasSetTotal && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-2 w-full">
                    <div className="text-sm font-semibold text-red-800 text-center">
                      No total points set before game started
                    </div>
                  </div>
                )}

                {/* Show pick result if user made a pick and game is final */}
                {isFinal && pick && (
                  <div className={`rounded-lg px-4 py-2 mt-2 ${
                    pickCorrect ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'
                  }`}>
                    <div className={`font-semibold ${
                      pickCorrect ? 'text-green-800' : 'text-red-800'
                    }`}>
                      Your pick: {pick} - {pickCorrect ? '✓ Correct' : '✗ Incorrect'}
                    </div>
                    {isMondayNight && userHasSetTotal && (
                      <div className={`text-sm mt-1 font-semibold ${
                        mondayNightTotals[g.id] === actualTotal ? 'text-green-700' : 'text-red-700'
                      }`}>
                        Total Points: <span className="text-lg font-bold">{mondayNightTotals[g.id]}</span> vs Actual: <span className="text-lg font-bold">{actualTotal}</span> - 
                        {mondayNightTotals[g.id] === actualTotal ? ' ✓ Correct' : ' ✗ Incorrect'}
                      </div>
                    )}
                  </div>
                )}

                {/* Show lock status message */}
                {locked && pick && !isFinal && (
                  <div className="bg-yellow-100 border border-yellow-300 rounded-lg px-4 py-2 mt-2">
                    <div className="text-sm font-semibold text-yellow-800">
                      Your pick is locked: {pick}
                    </div>
                  </div>
                )}
              </div>

              {/* Middle section: Team selection buttons - Centered */}
              {!isFinal && (
                <div className="flex justify-center items-center gap-3">
                  <div className="flex flex-wrap justify-center gap-3">
                    <button
                      disabled={locked}
                      onClick={() => selectPick(g.id, g.homeTeam, g.start_time)}
                      className={teamBtn(g.homeTeam) + " transform transition-transform hover:scale-105"}
                    >
                      {g.homeTeam}
                    </button>
                    <button
                      disabled={locked}
                      onClick={() => selectPick(g.id, g.awayTeam, g.start_time)}
                      className={teamBtn(g.awayTeam) + " transform transition-transform hover:scale-105"}
                    >
                      {g.awayTeam}
                    </button>
                  </div>
                </div>
              )}

              {/* Bottom section: Countdown - Centered */}
              {!isFinal && !isLive && (
                <div className="flex justify-center">
                  <div className="font-bold text-red-600 bg-red-100 px-4 py-2 rounded-lg border-2 border-red-200 text-center shadow-sm">
                    ⏰ {locked ? "Game locked - picks cannot be changed" : `Starts in ${getCountdown(g.start_time)}`}
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

export default MakePicksPage;