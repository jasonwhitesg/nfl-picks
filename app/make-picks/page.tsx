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
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [userSelectedWeek, setUserSelectedWeek] = useState<boolean>(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const SEASON_YEAR = 2025;

  // Get current time in MST
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

  // Handle game hover with position tracking
  const handleGameHover = (gameId: string, event: React.MouseEvent) => {
    setHoveredGame(gameId);
    setTooltipPosition({ x: event.clientX, y: event.clientY });
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

  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentUser(user);
        setUserEmail(user?.email || null);

        // Fetch profiles
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id, username, first_name, last_name, email, is_admin");
        setProfiles(profileData || []);

        // Check if current user is admin
        if (user) {
          const currentUserProfile = profileData?.find(p => p.user_id === user.id);
          setIsAdmin(currentUserProfile?.is_admin || false);
        }

        const { data: gameData } = await supabase.from("games").select("*");
        
        // Filter out bye week games
        const filteredGameData = (gameData || []).filter((g: any) => 
          g.team_a && g.team_b && 
          g.team_a.trim() !== '' && g.team_b.trim() !== '' &&
          g.team_a.toLowerCase() !== 'bye' && g.team_b.toLowerCase() !== 'bye'
        );

        // Convert UTC times to MST
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

        // Week selection logic
        if (!userSelectedWeek) {
          const weekNumbers = Array.from(new Set(sortedGames.map((g) => g.week))).sort((a, b) => a - b);
          const nowMST = getNowMST();
          
          let newActiveWeek = activeWeek;
          
          for (let week of weekNumbers) {
            const weekGames = sortedGames.filter(g => g.week === week);
            
            if (weekGames.length === 0) continue;
            
            const hasActiveGames = weekGames.some(game => {
              const gameTime = new Date(game.startTime);
              return gameTime > nowMST || (gameTime <= nowMST && game.status !== "Final");
            });
            
            const allGamesFinal = weekGames.every(game => game.status === "Final");
            
            if (hasActiveGames) {
              newActiveWeek = week;
              break;
            }
            
            if (allGamesFinal && !newActiveWeek) {
              newActiveWeek = week;
            }
          }
          
          if (newActiveWeek) {
            setActiveWeek(newActiveWeek);
          } else {
            newActiveWeek = weekNumbers[weekNumbers.length - 1] || 1;
            setActiveWeek(newActiveWeek);
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

  // Refetch paid status when active week changes
  useEffect(() => {
    if (activeWeek && profiles.length > 0) {
      fetchPaidStatus();
    }
  }, [activeWeek, profiles]);

  // Calculate user stats and best performers
  useEffect(() => {
    if (games.length === 0 || picks.length === 0 || profiles.length === 0 || !activeWeek) return;

    const stats: Record<string, UserStats> = {};
    
    let maxCorrectPicksPaid = 0;
    let maxCorrectPicksUnpaid = 0;

    profiles.forEach(profile => {
      const userPicks = picks.filter(pick => pick.user_id === profile.user_id);
      const weekGames = games.filter(game => game.week === activeWeek);
      
      const picksForThisWeek = userPicks.filter(pick => 
        weekGames.some(game => game.id === pick.game_id)
      );
      
      const hasMadePicks = picksForThisWeek.length > 0;
      const totalGamesInWeek = weekGames.length;
      
      let correctPicks = 0;

      weekGames.forEach(game => {
        const userPick = userPicks.find(p => p.game_id === game.id);
        if (userPick) {
          if (game.status === "Final" && game.winner !== null && userPick.selected_team === game.winner) {
            correctPicks++;
          }
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

      const isPaid = paidStatus[profile.user_id] || false;
      
      if (hasMadePicks) {
        if (isPaid && correctPicks > maxCorrectPicksPaid) {
          maxCorrectPicksPaid = correctPicks;
        } else if (!isPaid && correctPicks > maxCorrectPicksUnpaid) {
          maxCorrectPicksUnpaid = correctPicks;
        }
      }
    });

    // Find best performers
    const paidUsersWithMaxCorrect: string[] = [];
    const unpaidUsersWithMaxCorrect: string[] = [];

    const paidUsersWithPicks = profiles.filter(profile => {
      const userStat = stats[profile.user_id];
      const isPaid = paidStatus[profile.user_id] || false;
      return isPaid && userStat.hasMadePicks && userStat.correctPicks === maxCorrectPicksPaid;
    });

    const unpaidUsersWithPicks = profiles.filter(profile => {
      const userStat = stats[profile.user_id];
      const isPaid = paidStatus[profile.user_id] || false;
      return !isPaid && userStat.hasMadePicks && userStat.correctPicks === maxCorrectPicksUnpaid;
    });

    // Tie-breaker logic
    if (paidUsersWithPicks.length > 0) {
      let minMondayDifferencePaid = Infinity;
      paidUsersWithPicks.forEach(profile => {
        const userStat = stats[profile.user_id];
        if (userStat.mondayNightDifference !== null) {
          if (userStat.mondayNightDifference < minMondayDifferencePaid) {
            minMondayDifferencePaid = userStat.mondayNightDifference;
          }
        }
      });

      if (minMondayDifferencePaid === Infinity) {
        paidUsersWithPicks.forEach(profile => {
          paidUsersWithMaxCorrect.push(profile.user_id);
        });
      } else {
        paidUsersWithPicks.forEach(profile => {
          const userStat = stats[profile.user_id];
          if (userStat.mondayNightDifference === minMondayDifferencePaid) {
            paidUsersWithMaxCorrect.push(profile.user_id);
          }
        });
      }
    }

    if (unpaidUsersWithPicks.length > 0) {
      let minMondayDifferenceUnpaid = Infinity;
      unpaidUsersWithPicks.forEach(profile => {
        const userStat = stats[profile.user_id];
        if (userStat.mondayNightDifference !== null) {
          if (userStat.mondayNightDifference < minMondayDifferenceUnpaid) {
            minMondayDifferenceUnpaid = userStat.mondayNightDifference;
          }
        }
      });

      if (minMondayDifferenceUnpaid === Infinity) {
        unpaidUsersWithPicks.forEach(profile => {
          unpaidUsersWithMaxCorrect.push(profile.user_id);
        });
      } else {
        unpaidUsersWithPicks.forEach(profile => {
          const userStat = stats[profile.user_id];
          if (userStat.mondayNightDifference === minMondayDifferenceUnpaid) {
            unpaidUsersWithMaxCorrect.push(profile.user_id);
          }
        });
      }
    }

    setUserStats(stats);
    setBestPerformers({
      paidMostCorrect: paidUsersWithMaxCorrect,
      unpaidMostCorrect: unpaidUsersWithMaxCorrect
    });
  }, [games, picks, profiles, activeWeek, paidStatus]);

  // Timer for countdowns
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

  // Sort profiles
  const getSortedProfiles = () => {
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

  // Get games for active week
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

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-lg text-gray-600">Loading all picks...</p>
      </div>
    </div>
  );

  const activeWeekGames = getActiveWeekGames();
  const sortedProfiles = getSortedProfiles();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200/60 shadow-lg sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setHeaderExpanded(!headerExpanded)}
              className="p-2 rounded-xl hover:bg-gray-100/80 transition-all duration-200 flex items-center gap-2 border border-gray-200/60 shadow-sm"
            >
              <span className="text-xl">{headerExpanded ? "✕" : "☰"}</span>
              <span className="font-semibold text-gray-800 hidden sm:block">
                {headerExpanded ? "Close Menu" : "Menu"}
              </span>
            </button>
            <h1 className="text-2xl font-bold text-gray-800 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              All Player Picks
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold shadow-lg">
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

            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:from-red-600 hover:to-red-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Navigation Panel */}
        {headerExpanded && (
          <div className="absolute top-full left-0 w-80 bg-white/95 backdrop-blur-md border-b border-r border-gray-200/60 shadow-2xl z-40">
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Navigation</h2>
                <p className="text-sm text-gray-600">Quick access to all features</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-gray-100 hover:from-blue-50 hover:to-purple-50 hover:text-blue-700 transition-all duration-200 group border border-gray-200/60 hover:border-blue-200/80 shadow-sm hover:shadow-md"
                    onClick={() => setHeaderExpanded(false)}
                  >
                    <span className="text-2xl group-hover:scale-110 transition-transform">
                      {item.icon}
                    </span>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800 group-hover:text-blue-800">
                        {item.label}
                      </div>
                    </div>
                    <span className="text-gray-400 group-hover:text-blue-500 transition-colors">
                      →
                    </span>
                  </Link>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200/60">
                <h3 className="font-semibold text-gray-800 mb-3">Current Week Stats</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-3 border border-blue-200/60 shadow-sm">
                    <div className="text-xl font-bold text-blue-600">
                      {activeWeek ? (gamesByWeek[activeWeek]?.length || 0) : 0}
                    </div>
                    <div className="text-xs text-blue-800">Games</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-3 border border-green-200/60 shadow-sm">
                    <div className="text-xl font-bold text-green-600">
                      {sortedProfiles.length}
                    </div>
                    <div className="text-xs text-green-800">Players</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-3 border border-purple-200/60 shadow-sm">
                    <div className="text-xl font-bold text-purple-600">{activeWeek || 1}</div>
                    <div className="text-xs text-purple-800">Week</div>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200/80 rounded-xl shadow-sm">
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
      <main className="p-6 max-w-7xl mx-auto">
        {/* Admin badge */}
        {isAdmin && (
          <div className="mb-4 p-3 bg-gradient-to-r from-yellow-100 to-orange-100 border border-yellow-300 rounded-xl shadow-lg inline-block">
            <span className="text-yellow-800 font-semibold">🔧 Admin Mode - Click paid status to edit</span>
          </div>
        )}

        {/* Current Week Display */}
        {activeWeek && (
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl shadow-2xl border border-blue-400/30">
            <h2 className="text-2xl font-bold text-white text-center">
              {getCurrentWeekDisplay()}
            </h2>
            <p className="text-blue-100 text-center mt-2">
              Showing {sortedProfiles.length} players who made picks for this week
            </p>
          </div>
        )}

        {/* Week tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
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
                className={`px-5 py-3 rounded-xl font-bold transition-all duration-200 min-w-[110px] shadow-lg border-2 transform hover:scale-105 ${
                  isCurrentWeek 
                    ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white border-blue-500 shadow-2xl scale-105" 
                    : hasLiveGames
                      ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white border-green-400 hover:from-green-600 hover:to-emerald-700"
                      : hasUpcomingGames 
                        ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 border-green-200 hover:from-green-200 hover:to-emerald-200"
                        : "bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 border-gray-200 hover:from-gray-200 hover:to-gray-300"
                }`}
              >
                Week {week}
                {hasLiveGames && " 🔴"}
                {hasUpcomingGames && !hasLiveGames && " ⏱️"}
              </button>
            );
          })}
        </div>

        {/* Global Game Hover Tooltip */}
        {hoveredGame && (
          (() => {
            const game = activeWeekGames.find(g => g.id === hoveredGame);
            if (!game) return null;
            
            return (
              <div 
                className="fixed z-[1000] bg-gray-900 text-white text-sm px-4 py-3 rounded-xl shadow-2xl whitespace-nowrap border border-gray-600 pointer-events-none transform -translate-x-1/2 -translate-y-full"
                style={{
                  left: `${tooltipPosition.x}px`,
                  top: `${tooltipPosition.y - 10}px`
                }}
              >
                <div className="font-bold text-white mb-2 text-center">
                  {formatGameLabel(game)}
                </div>
                <div className="text-green-300 text-xs mb-1 text-center">
                  {formatTime(game.startTime)} MST
                </div>
                {new Date(game.startTime) > now && (
                  <div className="text-yellow-300 text-xs font-bold text-center">
                    ⏱️ Starts in: {getCountdown(game.startTime)}
                  </div>
                )}
                {game.status === "InProgress" && (
                  <div className="text-red-300 text-xs font-bold text-center">
                    🔴 LIVE - Game in progress
                  </div>
                )}
                {game.status === "Final" && (
                  <div className="text-blue-300 text-xs font-bold text-center">
                    ✅ FINAL - Game completed
                  </div>
                )}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
              </div>
            );
          })()
        )}

        {activeWeek && activeWeekGames.length > 0 ? (
          <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200/60 overflow-hidden">
            {/* Table container */}
            <div className="overflow-x-auto max-h-[80vh] overflow-y-auto">
              <table className="table-auto border-collapse w-full text-center">
                <thead className="sticky top-0 z-20">
                  <tr>
                    {/* Paid Column */}
                    <th className="sticky top-0 left-0 z-30 p-4 font-bold text-gray-800 bg-gradient-to-b from-yellow-100 to-yellow-200 border-r border-b border-gray-300/80 shadow-lg">
                      Paid
                      {isAdmin && (
                        <div className="text-xs font-normal text-gray-600 mt-1">
                          (Click to edit)
                        </div>
                      )}
                    </th>
                    
                    {/* Player Column */}
                    <th className="sticky top-0 left-[84px] z-30 p-4 font-bold text-gray-800 bg-gradient-to-b from-gray-100 to-gray-200 border-r border-b border-gray-300/80 shadow-lg">
                      <button 
                        onClick={() => handleSortClick('name')}
                        className="hover:bg-gray-300/50 px-3 py-2 rounded-xl transition-all duration-200 flex items-center gap-2 mx-auto"
                      >
                        Player
                        {sortBy === 'name' && (
                          <span className="text-sm font-bold">
                            {sortOrder === 'desc' ? '↓' : '↑'}
                          </span>
                        )}
                      </button>
                    </th>
                    
                    {/* Correct Column */}
                    <th className="sticky top-0 p-4 font-bold text-gray-800 bg-gradient-to-b from-gray-100 to-gray-200 border-r border-b border-gray-300/80 shadow-lg">
                      Correct
                    </th>
                    
                    {/* Percentage Column */}
                    <th className="sticky top-0 p-4 font-bold text-gray-800 bg-gradient-to-b from-gray-100 to-gray-200 border-r border-b border-gray-300/80 shadow-lg">
                      <button 
                        onClick={() => handleSortClick('percentage')}
                        className="hover:bg-gray-300/50 px-3 py-2 rounded-xl transition-all duration-200 flex items-center gap-2 mx-auto"
                      >
                        %
                        {sortBy === 'percentage' && (
                          <span className="text-sm font-bold">
                            {sortOrder === 'desc' ? '↓' : '↑'}
                          </span>
                        )}
                      </button>
                    </th>
                    
                    {/* Game columns with hover */}
                    {activeWeekGames.map((game) => (
                      <th 
                        key={game.id} 
                        className="sticky top-0 p-4 font-bold text-gray-800 bg-gradient-to-b from-gray-100 to-gray-200 border-r border-b border-gray-300/80 shadow-lg cursor-help group relative"
                        onMouseEnter={(e) => handleGameHover(game.id, e)}
                        onMouseLeave={() => setHoveredGame(null)}
                      >
                        <div className="text-sm leading-tight min-h-[60px] flex items-center justify-center text-center px-2">
                          {formatGameLabel(game)}
                        </div>
                      </th>
                    ))}
                    
                    {/* MNF columns */}
                    <th className="sticky top-0 p-4 font-bold text-gray-800 bg-gradient-to-b from-purple-100 to-purple-200 border-r border-b border-gray-300/80 shadow-lg">
                      MNF Pick
                    </th>
                    <th className="sticky top-0 p-4 font-bold text-gray-800 bg-gradient-to-b from-purple-100 to-purple-200 border-r border-b border-gray-300/80 shadow-lg">
                      Actual Total
                    </th>
                    <th className="sticky top-0 p-4 font-bold text-gray-800 bg-gradient-to-b from-purple-100 to-purple-200 border-b border-gray-300/80 shadow-lg">
                      Difference
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Locked row */}
                  <tr className="bg-gradient-to-r from-gray-200 to-gray-300">
                    <td className="sticky left-0 z-10 p-4 font-semibold text-gray-800 bg-gradient-to-b from-yellow-50 to-yellow-100 border-r border-b border-gray-300/80 shadow-inner">
                      -
                    </td>
                    <td className="sticky left-[84px] z-10 p-4 font-semibold text-gray-800 bg-gradient-to-b from-gray-200 to-gray-300 border-r border-b border-gray-300/80 shadow-inner">-</td>
                    <td className="p-4 font-semibold text-gray-800 border-r border-b border-gray-300/80">-</td>
                    <td className="p-4 font-semibold text-gray-800 border-r border-b border-gray-300/80">-</td>
                    {activeWeekGames.map((game) => {
                      const locked = isLocked(game.startTime);
                      return (
                        <td key={game.id} className="p-4 text-center border-r border-b border-gray-300/80">
                          <span
                            className={`inline-block w-5 h-5 rounded-full ${
                              locked ? "bg-gradient-to-br from-red-500 to-red-600 shadow-lg" : "bg-gradient-to-br from-green-500 to-green-600 shadow-lg"
                            }`}
                            title={locked ? "Game started / Pick locked" : "Pick available"}
                          ></span>
                          {locked && (
                            <div className="text-xs text-gray-600 mt-1 font-semibold">LOCKED</div>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-4 font-semibold text-gray-800 bg-gradient-to-b from-purple-50 to-purple-100 border-r border-b border-gray-300/80">-</td>
                    <td className="p-4 font-semibold text-gray-800 bg-gradient-to-b from-purple-50 to-purple-100 border-r border-b border-gray-300/80">-</td>
                    <td className="p-4 font-semibold text-gray-800 bg-gradient-to-b from-purple-50 to-purple-100 border-b border-gray-300/80">-</td>
                  </tr>

                  {/* Player picks */}
                  {sortedProfiles.map((user, index) => {
                    const stats = userStats[user.user_id] || {
                      correctPicks: 0,
                      totalPicks: 0,
                      percentage: 0,
                      mondayNightPick: null,
                      actualMondayTotal: null,
                      mondayNightDifference: null
                    };

                    const userPaidStatus = paidStatus[user.user_id] || false;
                    const isPaidMostCorrect = bestPerformers.paidMostCorrect.includes(user.user_id);
                    const isUnpaidMostCorrect = bestPerformers.unpaidMostCorrect.includes(user.user_id);
                    const isWinner = isPaidMostCorrect || isUnpaidMostCorrect;
                    const isPaidWinner = isPaidMostCorrect;
                    const isUnpaidWinner = isUnpaidMostCorrect;

                    const mondayNightGame = activeWeekGames.find((game: Game) => game.is_monday_night);
                    const mondayNightLocked = mondayNightGame ? isLocked(mondayNightGame.startTime) : false;
                    const mondayNightFinal = mondayNightGame?.status === "Final";

                    const getWinnerBackgroundColor = () => {
                      if (isPaidWinner) return "bg-gradient-to-r from-green-100 to-emerald-100 border-green-300";
                      if (isUnpaidWinner) return "bg-gradient-to-r from-orange-100 to-amber-100 border-orange-300";
                      return index % 2 === 0 ? "bg-gray-50/80" : "bg-white/80";
                    };

                    const getWinnerTextColor = () => {
                      if (isPaidWinner) return "text-green-900";
                      if (isUnpaidWinner) return "text-orange-900";
                      return "text-gray-800";
                    };

                    return (
                      <tr key={user.user_id} className={`hover:bg-blue-50/80 transition-all duration-200 ${isWinner ? getWinnerBackgroundColor() : ''}`}>
                        {/* Paid Column */}
                        <td 
                          className={`sticky left-0 z-10 p-4 text-center font-semibold border-r border-b border-gray-300/80 ${
                            isWinner ? getWinnerBackgroundColor() + ' ' + getWinnerTextColor() : 'bg-gradient-to-b from-yellow-50 to-yellow-100'
                          } ${
                            isAdmin && !updatingPaidStatus ? 'cursor-pointer hover:bg-yellow-200 transition-colors' : ''
                          }`}
                          onClick={() => isAdmin && !updatingPaidStatus && setEditingPaidStatus(user.user_id)}
                        >
                          {updatingPaidStatus === user.user_id ? (
                            <div className="flex items-center justify-center">
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                            </div>
                          ) : editingPaidStatus === user.user_id ? (
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePaidStatus(user.user_id);
                                }}
                                className={`px-2 py-1 rounded-lg text-white text-xs font-bold transition-all ${
                                  userPaidStatus ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700' : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
                                }`}
                              >
                                {userPaidStatus ? 'Mark Unpaid' : 'Mark Paid'}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingPaidStatus(null);
                                }}
                                className="px-2 py-1 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg text-xs font-bold hover:from-gray-600 hover:to-gray-700 transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              {userPaidStatus ? (
                                <span className="text-green-600 text-xl font-bold" title="Paid">✓</span>
                              ) : (
                                <span className="text-red-500 text-xl font-bold" title="Not Paid">✗</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Player name */}
                        <td 
                          className={`sticky left-[84px] z-10 p-4 font-semibold relative border-r border-b border-gray-300/80 ${
                            isWinner ? getWinnerBackgroundColor() : 'bg-gradient-to-b from-gray-50 to-gray-100'
                          } text-gray-900`}
                          onMouseEnter={() => setHoveredUser(user.user_id)}
                          onMouseLeave={() => setHoveredUser(null)}
                        >
                          <div className="cursor-default">
                            <span className="text-gray-900 font-bold">{user.username}</span>
                            {isPaidWinner && <div className="text-xs text-green-700 mt-1 font-bold">🏆 Most Correct (Paid Winner)</div>}
                            {isUnpaidWinner && <div className="text-xs text-orange-700 mt-1 font-bold">🥈 Most Correct (Would Have Won)</div>}
                          </div>
                          
                          {/* Hover Tooltip */}
                          {(hoveredUser === user.user_id) && (
                            <div className="absolute left-1/2 transform -translate-x-1/2 bottom-full mb-2 z-50 bg-gray-900 text-white text-sm px-3 py-2 rounded-xl shadow-2xl whitespace-nowrap border border-gray-600">
                              <div className="font-semibold">
                                {user.first_name} {user.last_name}
                              </div>
                              <div className="text-xs text-gray-300 mt-1">
                                {user.email}
                              </div>
                              <div className="text-xs text-gray-300 mt-1">
                                {userPaidStatus ? "Paid ✅" : "Not Paid ❌"}
                              </div>
                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          )}
                        </td>

                        {/* Correct picks */}
                        <td className={`p-4 font-bold border-r border-b border-gray-300/80 ${
                          isWinner ? getWinnerTextColor() : 'text-blue-900'
                        } ${isWinner ? '' : 'bg-gradient-to-b from-blue-50 to-blue-100'}`}>
                          {stats.correctPicks}/{stats.totalPicks}
                        </td>

                        {/* Percentage */}
                        <td className={`p-4 font-bold border-r border-b border-gray-300/80 ${
                          isWinner ? getWinnerTextColor() : 'text-blue-900'
                        } ${isWinner ? '' : 'bg-gradient-to-b from-blue-50 to-blue-100'}`}>
                          {stats.percentage}%
                        </td>

                        {/* Game picks */}
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
                              className={`p-4 text-center font-bold border-r border-b border-gray-300/80 transition-all duration-200 ${
                                showPick 
                                  ? userPick 
                                    ? isCorrect
                                      ? "bg-gradient-to-b from-green-100 to-green-200 text-green-900 border border-green-300/80 shadow-inner"
                                      : "bg-gradient-to-b from-red-100 to-red-200 text-red-900 border border-red-300/80 shadow-inner"
                                    : "bg-gradient-to-b from-red-100 to-red-200 text-red-900 border border-red-300/80 shadow-inner"
                                  : "bg-gradient-to-b from-gray-100 to-gray-200 text-gray-600 border border-gray-300/80"
                              } ${isWinner ? getWinnerBackgroundColor() : ''}`}
                            >
                              {displayPick}
                              {game.is_monday_night && locked && userPick?.total_points !== null && userPick?.total_points !== undefined && (
                                <div className="text-xs text-purple-600 mt-1 font-semibold">
                                  Total: {userPick.total_points}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Monday night pick column */}
                        <td className={`p-4 font-bold border-r border-b border-gray-300/80 ${
                          isWinner ? getWinnerTextColor() : 'text-purple-900'
                        } bg-gradient-to-b from-purple-50 to-purple-100`}>
                          {mondayNightLocked 
                            ? (stats.mondayNightPick !== null ? stats.mondayNightPick : "-") 
                            : "❓"
                          }
                        </td>

                        {/* Actual total column */}
                        <td className="p-4 font-bold text-purple-900 border-r border-b border-gray-300/80 bg-gradient-to-b from-purple-50 to-purple-100">
                          {mondayNightFinal && stats.actualMondayTotal !== null ? stats.actualMondayTotal : "-"}
                        </td>

                        {/* Difference column */}
                        <td className={`p-4 font-bold border-b border-gray-300/80 ${
                          isWinner ? getWinnerTextColor() : 'text-purple-900'
                        } bg-gradient-to-b from-purple-50 to-purple-100`}>
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
          <div className="text-center p-12 bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200/60">
            <p className="text-2xl text-gray-600 font-bold">No games found for the selected week.</p>
          </div>
        )}

        {/* Legend */}
        <div className="mt-8 p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-3xl shadow-2xl border border-blue-200/60">
          <h3 className="font-bold text-2xl text-gray-800 mb-6 text-center bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            How It Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-3 p-3 bg-white/80 rounded-xl border border-gray-200/60 shadow-sm">
              <span className="inline-block w-4 h-4 rounded-full bg-gradient-to-br from-green-500 to-green-600 border border-green-600 shadow-md"></span>
              <span className="text-gray-800 font-semibold">Pick available (game hasn't started)</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/80 rounded-xl border border-gray-200/60 shadow-sm">
              <span className="inline-block w-4 h-4 rounded-full bg-gradient-to-br from-red-500 to-red-600 border border-red-600 shadow-md"></span>
              <span className="text-gray-800 font-semibold">Pick locked (game started)</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/80 rounded-xl border border-gray-200/60 shadow-sm">
              <span className="text-green-600 text-xl font-bold">✓</span>
              <span className="text-gray-800 font-semibold">Paid</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/80 rounded-xl border border-gray-200/60 shadow-sm">
              <span className="text-red-500 text-xl font-bold">✗</span>
              <span className="text-gray-800 font-semibold">Not paid</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-100 to-emerald-100 rounded-xl border border-green-300 shadow-sm">
              <span className="font-bold text-green-900">🏆</span>
              <span className="text-green-900 font-semibold">Most correct picks (Paid winners)</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-orange-100 to-amber-100 rounded-xl border border-orange-300 shadow-sm">
              <span className="font-bold text-orange-900">🥈</span>
              <span className="text-orange-900 font-semibold">Would have won (Unpaid winners)</span>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-yellow-100 to-orange-100 rounded-xl border border-yellow-300 shadow-sm">
                <span className="font-bold text-yellow-900">Click</span>
                <span className="text-yellow-900 font-semibold">Admin: Click paid status to edit</span>
              </div>
            )}
            <div className="flex items-center gap-3 p-3 bg-white/80 rounded-xl border border-gray-200/60 shadow-sm">
              <span className="text-gray-600 text-xl font-bold">❓</span>
              <span className="text-gray-800 font-semibold">Pick hidden until game starts</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-100 to-green-200 rounded-xl border border-green-300 shadow-sm">
              <span className="text-green-900 font-bold">Team</span>
              <span className="text-green-900 font-semibold">Pick made</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-100 to-purple-200 rounded-xl border border-purple-300 shadow-sm">
              <span className="text-purple-900 font-bold">MNF</span>
              <span className="text-purple-900 font-semibold">Monday Night Football</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-white/80 rounded-xl border border-gray-200/60 shadow-sm">
              <span className="text-purple-600 text-xs font-bold">Total: XX</span>
              <span className="text-gray-800 font-semibold">Monday night total (shown when final)</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-xl border border-blue-300 shadow-sm">
              <span className="text-blue-900 font-bold">Hover Game</span>
              <span className="text-blue-900 font-semibold">See game time and countdown</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-xl border border-blue-300 shadow-sm">
              <span className="text-blue-900 font-bold">Hover Name</span>
              <span className="text-blue-900 font-semibold">See user's first and last name</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AllPicksPage;