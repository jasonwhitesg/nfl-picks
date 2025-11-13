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
  is_monday_night: boolean;
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
  const [debugActive, setDebugActive] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);

  const addDebugInfo = (message: string) => {
    if (!debugActive) return;
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

    // FIXED WEEK SELECTION LOGIC
    if (!userSelectedWeek) {
      const weekNumbers = Array.from(new Set(mapped.map((g) => g.week))).sort((a, b) => a - b);
      
      let newActiveWeek = activeWeek;
      
      // Find the current week by checking each week from lowest to highest
      for (let week of weekNumbers) {
        const weekGames = mapped.filter(g => g.week === week);
        
        if (weekGames.length === 0) continue;
        
        // Check if this week has any upcoming or in-progress games
        const hasActiveGames = weekGames.some(game => {
          const gameTime = new Date(game.start_time);
          return gameTime > now || (gameTime <= now && game.status !== "Final");
        });
        
        // Check if all games are final
        const allGamesFinal = weekGames.every(game => game.status === "Final");
        
        addDebugInfo(`🔍 Week ${week}: games=${weekGames.length}, hasActive=${hasActiveGames}, allFinal=${allGamesFinal}`);
        
        // If this week has active games, use it
        if (hasActiveGames) {
          newActiveWeek = week;
          addDebugInfo(`🎯 Setting active week to ${week} - has active games`);
          break;
        }
        
        // If all games are final and we haven't found an active week yet, 
        // keep track of this as a potential fallback
        if (allGamesFinal && !newActiveWeek) {
          newActiveWeek = week;
          addDebugInfo(`📌 Week ${week} as fallback - all games final`);
        }
      }
      
      // If no active week found but we have a fallback (most recent completed week), use it
      if (newActiveWeek) {
        setActiveWeek(newActiveWeek);
        addDebugInfo(`📅 Final active week: ${newActiveWeek}`);
      } else {
        // Final fallback
        newActiveWeek = weekNumbers[weekNumbers.length - 1] || 1;
        setActiveWeek(newActiveWeek);
        addDebugInfo(`🎯 Final fallback: using week ${newActiveWeek}`);
      }
    } else {
      addDebugInfo(`📅 Keeping user-selected week: ${activeWeek}`);
    }

    // Detailed debug for current week
    if (activeWeek) {
      const currentWeekGames = mapped.filter(g => g.week === activeWeek);
      addDebugInfo(`🔍 Current Week ${activeWeek} games: ${currentWeekGames.length} total`);
      
      currentWeekGames.forEach(g => {
        const scoreInfo = g.home_score !== null && g.away_score !== null 
          ? `${g.away_score}-${g.home_score}` 
          : 'null-null';
        const gameTime = new Date(g.start_time);
        const timeStatus = gameTime > now ? 'UPCOMING' : (g.status === 'Final' ? 'FINAL' : 'IN_PROGRESS');
        addDebugInfo(`🏈 ${g.awayTeam} @ ${g.homeTeam}: ${scoreInfo} - ${g.status} - ${timeStatus} ${g.is_monday_night ? '(MNF)' : ''}`);
      });

      // Check Monday Night Football specifically
      const mondayNightGame = currentWeekGames.find(g => g.is_monday_night);
      if (mondayNightGame) {
        addDebugInfo(`🎯 MNF GAME: ${mondayNightGame.awayTeam} @ ${mondayNightGame.homeTeam}: ${mondayNightGame.status}`);
      }
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

  // Toggle debug logging
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

  const selectPick = async (gameId: string, team: string, lockTime: string, isMondayNight: boolean) => {
    // FIXED: Proper null check for Monday night totals
    const currentTotal = mondayNightTotals[gameId];
    if (isMondayNight && (currentTotal === null || currentTotal === undefined || currentTotal <= 0)) {
      alert("You must set a valid Monday Night Football total points (greater than 0) before making your pick.");
      return;
    }

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
          total_points: currentTotal || null
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

  const handleMondayNightTotalChange = async (gameId: string, value: string) => {
    if (!userId) return;
    
    // FIXED: Convert empty string to null, otherwise parse as number
    const totalPoints = value === '' ? null : parseInt(value);
    
    setMondayNightTotals(prev => ({
      ...prev,
      [gameId]: totalPoints
    }));

    // Only save to database if it's a valid number (not null)
    if (totalPoints !== null) {
      try {
        const { error } = await supabase
          .from("game_picks")
          .update({ total_points: totalPoints })
          .eq("user_id", userId)
          .eq("game_id", gameId);

        if (error) {
          console.error("Error saving total score:", error);
          alert("Error saving total score. Please try again.");
          // FIXED: Proper null check when reverting
          const previousTotal = mondayNightTotals[gameId];
          setMondayNightTotals(prev => ({
            ...prev,
            [gameId]: previousTotal
          }));
        } else {
          addDebugInfo(`✅ Total points saved: ${totalPoints} for game ${gameId}`);
        }
      } catch (err) {
        console.error("Error saving total score:", err);
        alert("Error saving total score. Please try again.");
        // FIXED: Proper null check when reverting
        const previousTotal = mondayNightTotals[gameId];
        setMondayNightTotals(prev => ({
          ...prev,
          [gameId]: previousTotal
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

  // Navigation items
  const navItems = [
    { href: "/", label: "Home", icon: "🏠" },
    { href: "/all-picks", label: "View All Picks", icon: "📊" },
    { href: "/pick-summary", label: "Pick Percentages", icon: "📈" },
    { href: "/standings", label: "Standings", icon: "🏆" },
    { href: "/rules", label: "Rules", icon: "📋" },
    { href: "/profile", label: "Profile", icon: "👤" },
  ];

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
            <h1 className="text-2xl font-bold text-gray-800">NFL Weekly Picks</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Debug Buttons - Only show if debug panel is visible AND user is admin */}
            {showDebug && isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchGames(true)}
                  className="bg-orange-500 text-white px-3 py-1 rounded hover:bg-orange-600 transition-colors text-xs"
                >
                  Refresh Scores
                </button>
                <button
                  onClick={runScoreUpdate}
                  className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors text-xs"
                >
                  Update Scores API
                </button>
                <button
                  onClick={toggleDebugActive}
                  className={`px-3 py-1 rounded transition-colors text-xs ${
                    debugActive 
                      ? 'bg-red-500 text-white hover:bg-red-600' 
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {debugActive ? 'Stop Debug' : 'Start Debug'}
                </button>
              </div>
            )}
            
            {/* Show debug toggle button - Only show for admin users */}
            {isAdmin && (
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 transition-colors text-xs"
              >
                {showDebug ? 'Hide Debug' : 'Show Debug'}
              </button>
            )}

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
                      {activeWeek ? (gamesByWeek[activeWeek]?.filter(g => picks[g.id]).length || 0) : 0}
                    </div>
                    <div className="text-xs text-green-800">Your Picks</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-purple-600">{activeWeek || currentWeekNum}</div>
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
            // FIXED: Proper null check for userHasSetTotal
            const currentTotal = mondayNightTotals[g.id];
            const userHasSetTotal = currentTotal !== null && currentTotal !== undefined && currentTotal > 0;
            const actualTotal = g.home_score != null && g.away_score != null ? g.home_score + g.away_score : null;

            const pickCorrect = isFinal && pick ? (pick === g.winner ? true : false) : null;

            // FIXED: Determine if Monday night buttons should be disabled
            const mondayNightButtonsDisabled = isMondayNight && !isFinal && !locked && !userHasSetTotal;

            const teamBtn = (team: string) => {
              let base = "px-4 py-2 rounded-md font-semibold transition-all text-center min-w-[80px]";

              // FIXED: Handle Monday night disabled state
              if (mondayNightButtonsDisabled) {
                base += " bg-gray-100 text-gray-400 cursor-not-allowed";
              } else if (pick === team && !isFinal) {
                base += " bg-blue-500 text-white";
              } else if (pick === team && isFinal) {
                base += pickCorrect
                  ? " bg-green-500 text-white"
                  : " bg-red-500 text-white";
              } else if (locked && pick !== team) {
                base += " bg-gray-100 text-gray-500 cursor-not-allowed";
              } else {
                base += " bg-gray-200 text-gray-800 hover:bg-gray-300 cursor-pointer";
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
                              (Your pick: <span className="text-lg font-bold text-purple-800">{currentTotal}</span>)
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
                        Set Monday Night Total Points (Required before making pick)
                      </div>
                      <div className="flex justify-center items-center gap-3">
                        <div className="flex flex-col items-center gap-2">
                          <label className="text-sm font-medium text-gray-700">Total Points</label>
                          <input
                            type="number"
                            min="1"  // FIXED: Changed from 0 to 1 to prevent 0 values
                            max="100"
                            value={currentTotal ?? ''}
                            onChange={(e) => handleMondayNightTotalChange(g.id, e.target.value)}
                            className="w-24 px-3 py-2 border-2 border-purple-300 rounded text-center font-bold text-lg text-purple-800 bg-white"
                            placeholder="Enter total"
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
                          Total points set: <span className="text-lg font-bold">{currentTotal}</span> - You can now make your pick!
                        </div>
                      )}
                      {!userHasSetTotal && (
                        <div className="text-sm font-semibold text-red-600 text-center mt-2">
                          ⚠️ You must set total points (greater than 0) before making your pick
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
                        Total Points Locked: <span className="text-lg font-bold text-yellow-900">{currentTotal}</span>
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
                          currentTotal === actualTotal ? 'text-green-700' : 'text-red-700'
                        }`}>
                          Total Points: <span className="text-lg font-bold">{currentTotal}</span> vs Actual: <span className="text-lg font-bold">{actualTotal}</span> - 
                          {currentTotal === actualTotal ? ' ✓ Correct' : ' ✗ Incorrect'}
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
                        disabled={locked || mondayNightButtonsDisabled}
                        onClick={() => selectPick(g.id, g.homeTeam, g.start_time, isMondayNight)}
                        className={teamBtn(g.homeTeam) + " transform transition-transform hover:scale-105"}
                        title={mondayNightButtonsDisabled ? "Set total points first" : ""}
                      >
                        {g.homeTeam}
                      </button>
                      <button
                        disabled={locked || mondayNightButtonsDisabled}
                        onClick={() => selectPick(g.id, g.awayTeam, g.start_time, isMondayNight)}
                        className={teamBtn(g.awayTeam) + " transform transition-transform hover:scale-105"}
                        title={mondayNightButtonsDisabled ? "Set total points first" : ""}
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
      </main>
    </div>
  );
};

export default MakePicksPage;