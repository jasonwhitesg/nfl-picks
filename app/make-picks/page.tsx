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
  const [updatingScores, setUpdatingScores] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number>(2026);


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
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error("Auth error:", error);
        router.push("/login");
        return;
      }
      
      if (!data.session) {
        router.push("/login");
        return;
      }
      
      const user = data.session.user;
      const normalizedEmail = user.email?.toLowerCase() || null;
      setUserEmail(normalizedEmail);
      
      // Use auth user ID as primary identifier
      setUserId(user.id);
      addDebugInfo(`🔐 User authenticated: ${user.id}`);

      // Get profile using auth user ID (most reliable)
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, is_admin")
        .eq("user_id", user.id)
        .single();

      if (profileError) {
        console.error("Profile lookup error:", profileError);
        // If profile not found by user_id, try email as fallback
        if (normalizedEmail) {
          const { data: profileByEmail } = await supabase
            .from("profiles")
            .select("user_id, is_admin")
            .eq("email", normalizedEmail)
            .single();
            
          if (profileByEmail) {
            setIsAdmin(profileByEmail.is_admin || false);
            addDebugInfo(`✅ Profile found by email: ${profileByEmail.user_id}`);
          }
        }
      } else if (profile) {
        setIsAdmin(profile.is_admin || false);
        addDebugInfo(`✅ Profile found: ${profile.user_id}`);
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
        addDebugInfo(`✅ Loaded ${data.length} picks`);
      } else if (error) {
        addDebugInfo(`❌ Error loading picks: ${error.message}`);
      }
    };
    
    fetchPicksAndTotals();
  }, [userId]);

  const fetchGames = async (forceRefresh = false) => {
    addDebugInfo(`Fetching games from database... ${forceRefresh ? '(FORCED)' : ''}`);
    

    const seasonYear = selectedSeason;

    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("season", seasonYear)
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
        start_time: g.start_time,
        home_score: g.home_score,
        away_score: g.away_score,
        winner,
        status,
        is_monday_night: g.is_monday_night,
        actual_total_points: g.actual_total_points,
      };
    });

    setGames(mapped);

    // Auto-select current week if user hasn't manually selected one
    if (!userSelectedWeek) {
      const weekNumbers = Array.from(new Set(mapped.map((g) => g.week))).sort((a, b) => a - b);
      
      let newActiveWeek = activeWeek;
      
      // Find the current week by checking each week from lowest to highest
      for (let week of weekNumbers) {
        const weekGames = mapped.filter(g => g.week === week);
        if (weekGames.length === 0) continue;
        
        const hasActiveGames = weekGames.some(game => {
          const gameTime = new Date(game.start_time);
          return gameTime > now || (gameTime <= now && game.status !== "Final");
        });
        
        const allGamesFinal = weekGames.every(game => game.status === "Final");
        
        addDebugInfo(`🔍 Week ${week}: games=${weekGames.length}, hasActive=${hasActiveGames}, allFinal=${allGamesFinal}`);
        
        if (hasActiveGames) {
          newActiveWeek = week;
          addDebugInfo(`🎯 Setting active week to ${week} - has active games`);
          break;
        }
        
        if (allGamesFinal && !newActiveWeek) {
          newActiveWeek = week;
          addDebugInfo(`📌 Week ${week} as fallback - all games final`);
        }
      }
      
      if (newActiveWeek) {
        setActiveWeek(newActiveWeek);
        addDebugInfo(`📅 Final active week: ${newActiveWeek}`);
      } else {
        newActiveWeek = weekNumbers[weekNumbers.length - 1] || 1;
        setActiveWeek(newActiveWeek);
        addDebugInfo(`🎯 Final fallback: using week ${newActiveWeek}`);
      }
    }
  };

  useEffect(() => {
  if (!userId) return;

  fetchGames();

  const interval = setInterval(() => {
    fetchGames();
  }, 30000);

  return () => clearInterval(interval);
}, [userId, selectedSeason]);

  useEffect(() => {
    if (!userId) return;

    setGames([]);
    setActiveWeek(null);
    setUserSelectedWeek(false);

    fetchGames(true);
  }, [selectedSeason, userId]);

  const handleWeekSelect = (week: number) => {
    setUserSelectedWeek(true);
    setActiveWeek(week);

    addDebugInfo(`🎯 User manually selected week: ${week}`);
  };

  useEffect(() => {
    setUserSelectedWeek(false);
  }, []);

  const toggleDebugActive = () => {
    setDebugActive(!debugActive);
    addDebugInfo(`Debug logging ${!debugActive ? 'STARTED' : 'STOPPED'}`);
  };

  // Find the earliest Sunday game at or after 2:00 PM (14:00) for the current week
  const getWeekLockTimeForCurrentWeek = (): Date | null => {
    if (!activeWeek) return null;
    
    const weekGames = gamesByWeek[activeWeek] || [];
    
    // Only consider SUNDAY games
    const sundayGames = weekGames.filter(game => {
      const gameTime = new Date(game.start_time);
      const dayOfWeek = gameTime.getDay(); // 0 = Sunday
      return dayOfWeek === 0; // Only Sunday games
    });
    
    if (sundayGames.length === 0) {
      return null;
    }
    
    // Find Sunday games at or after 2:00 PM (14:00 hours)
    const afternoonSundayGames = sundayGames.filter(game => {
      const gameTime = new Date(game.start_time);
      const hours = gameTime.getHours();
      // 14:00 = 2:00 PM
      return hours >= 14; // At or after 2:00 PM
    });
    
    if (afternoonSundayGames.length === 0) {
      return null; // No afternoon games this week
    }
    
    // Sort by time to find the earliest afternoon game
    const sortedAfternoonGames = afternoonSundayGames.sort((a, b) => 
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    
    // Return the time of the earliest Sunday game at/after 2:00 PM
    return new Date(sortedAfternoonGames[0].start_time);
  };

  // Lock logic with week-specific rules
  const isLocked = (isoDate: string) => {
    const gameTime = new Date(isoDate);
    
    // Individual game lock: game starts at its own time
    const individualGameLocked = now >= gameTime;
    
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
      const weekLocked = now >= weekLockTime;
      
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

  // Get countdown to lock time
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

  // Get detailed lock message
  const getLockMessage = (gameTime: Date, gameId: string) => {
    const dayOfWeek = gameTime.getDay();
    const weekLockTime = getWeekLockTimeForCurrentWeek();
    
    // First check if week is already locked
    if (weekLockTime && now >= weekLockTime) {
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
            const gt = new Date(game.start_time);
            return gt.getDay() === 0 && gt.getHours() >= 14;
          })
          ?.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
        
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
            const gt = new Date(game.start_time);
            return gt.getDay() === 0 && gt.getHours() >= 14;
          })
          ?.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
        
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

  // Admin functions for updating scores
  const runScoreUpdate = async () => {
    if (!isAdmin) return;
    
    setUpdatingScores(true);
    addDebugInfo("🔄 Manually triggering score update...");
    
    try {
      const response = await fetch('/api/update-scores');
      const result = await response.json();
      
      addDebugInfo(`✅ API Response: ${JSON.stringify(result)}`);
      
      if (response.ok) {
        // Refresh games after update
        setTimeout(() => {
          fetchGames(true);
          setUpdatingScores(false);
        }, 2000);
      } else {
        addDebugInfo(`❌ API Error: ${result.error}`);
        setUpdatingScores(false);
      }
    } catch (error) {
      addDebugInfo(`❌ API Error: ${error}`);
      setUpdatingScores(false);
    }
  };

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
  };

  const debugUserPicks = async () => {
    if (!isAdmin) return;
    
    addDebugInfo("🔍 DEBUG: Checking gstark02@yahoo.com picks...");
    
    // First find the user_id for gstark02@yahoo.com
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", "gstark02@yahoo.com")
      .single();

    if (!profile) {
      addDebugInfo("❌ User gstark02@yahoo.com not found in profiles");
      return;
    }

    addDebugInfo(`📋 User ID for gstark02@yahoo.com: ${profile.user_id}`);

    // Check all picks for this user
    const { data: picks } = await supabase
      .from("game_picks")
      .select("game_id, selected_team, total_points")
      .eq("user_id", profile.user_id);

    addDebugInfo(`📊 gstark02@yahoo.com has ${picks?.length || 0} picks in database`);
    
    if (picks) {
      picks.forEach(pick => {
        addDebugInfo(`   Game ${pick.game_id}: ${pick.selected_team} (total: ${pick.total_points})`);
      });
    }

    // Check if current user matches
    addDebugInfo(`🔍 Current userId state: ${userId}`);
    addDebugInfo(`🔍 Current userEmail state: ${userEmail}`);
  };

  const teamStyles: Record<
  string,
  { primary: string; secondary: string; text: string }
> = {
  ARI: { primary: "#97233F", secondary: "#FFB612", text: "#ffffff" },
  ATL: { primary: "#A71930", secondary: "#000000", text: "#ffffff" },
  BAL: { primary: "#241773", secondary: "#9E7C0C", text: "#ffffff" },
  BUF: { primary: "#00338D", secondary: "#C60C30", text: "#ffffff" },
  CAR: { primary: "#0085CA", secondary: "#101820", text: "#ffffff" },
  CHI: { primary: "#0B162A", secondary: "#C83803", text: "#ffffff" },
  CIN: { primary: "#FB4F14", secondary: "#000000", text: "#ffffff" },
  CLE: { primary: "#311D00", secondary: "#FF3C00", text: "#ffffff" },
  DAL: { primary: "#041E42", secondary: "#869397", text: "#ffffff" },
  DEN: { primary: "#FB4F14", secondary: "#002244", text: "#ffffff" },
  DET: { primary: "#0076B6", secondary: "#B0B7BC", text: "#ffffff" },
  GB: { primary: "#203731", secondary: "#FFB612", text: "#ffffff" },
  HOU: { primary: "#03202F", secondary: "#A71930", text: "#ffffff" },
  IND: { primary: "#002C5F", secondary: "#A2AAAD", text: "#ffffff" },
  JAX: { primary: "#006778", secondary: "#D7A22A", text: "#ffffff" },
  KC: { primary: "#E31837", secondary: "#FFB81C", text: "#ffffff" },
  LAC: { primary: "#0080C6", secondary: "#FFC20E", text: "#ffffff" },
  LAR: { primary: "#003594", secondary: "#FFA300", text: "#ffffff" },
  LV: { primary: "#000000", secondary: "#A5ACAF", text: "#ffffff" },
  MIA: { primary: "#008E97", secondary: "#FC4C02", text: "#ffffff" },
  MIN: { primary: "#4F2683", secondary: "#FFC62F", text: "#ffffff" },
  NE: { primary: "#002244", secondary: "#C60C30", text: "#ffffff" },
  NO: { primary: "#D3BC8D", secondary: "#101820", text: "#000000" },
  NYG: { primary: "#0B2265", secondary: "#A71930", text: "#ffffff" },
  NYJ: { primary: "#125740", secondary: "#000000", text: "#ffffff" },
  PHI: { primary: "#004C54", secondary: "#A5ACAF", text: "#ffffff" },
  PIT: { primary: "#FFB612", secondary: "#101820", text: "#000000" },
  SEA: { primary: "#002244", secondary: "#69BE28", text: "#ffffff" },
  SF: { primary: "#AA0000", secondary: "#B3995D", text: "#ffffff" },
  TB: { primary: "#D50A0A", secondary: "#34302B", text: "#ffffff" },
  TEN: { primary: "#4B92DB", secondary: "#C8102E", text: "#ffffff" },
  WAS: { primary: "#5A1414", secondary: "#FFB612", text: "#ffffff" },
};

const getTeamStyle = (team?: string | null) => {
  if (!team) {
    return { primary: "#ffffff", secondary: "#e5e7eb", text: "#111827" };
  }

  return (
    teamStyles[team] || {
      primary: "#2563eb",
      secondary: "#1e40af",
      text: "#ffffff",
    }
  );
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const selectPick = async (gameId: string, team: string, lockTime: string, isMondayNight: boolean) => {
    const currentTotal = mondayNightTotals[gameId];
    
    addDebugInfo(`🎯 Making pick: ${team} for game ${gameId}`);

    if (isMondayNight && (currentTotal === null || currentTotal === undefined || currentTotal <= 0)) {
      alert("You must set a valid Monday Night Football total points (greater than 0) before making your pick.");
      return;
    }

    if (isLocked(lockTime)) {
      alert("This game is locked. You cannot change your pick.");
      return;
    }

    if (!userId) {
      alert("User not authenticated. Please try logging out and back in.");
      return;
    }

    // Update UI immediately
    setPicks((prev) => ({ ...prev, [gameId]: team }));

    try {
      const pickData = {
        user_id: userId,
        game_id: gameId,
        selected_team: team,
        lock_time: lockTime,
        is_locked: false,
        total_points: isMondayNight ? currentTotal : null
      };

      const { error } = await supabase
        .from("game_picks")
        .upsert(pickData, {
          onConflict: 'user_id,game_id'
        });

      if (error) {
        console.error("Error saving pick:", error);
        setPicks((prev) => ({ ...prev, [gameId]: picks[gameId] }));
        alert("Error saving your pick. Please try again.");
      } else {
        addDebugInfo(`✅ Pick saved successfully!`);
      }
    } catch (err) {
      console.error("Error saving pick:", err);
      setPicks((prev) => ({ ...prev, [gameId]: picks[gameId] }));
      alert("Error saving your pick. Please try again.");
    }
  };

  const handleMondayNightTotalChange = async (gameId: string, value: string) => {
    if (!userId) return;
    
    const totalPoints = value === '' ? null : parseInt(value);
    
    setMondayNightTotals(prev => ({
      ...prev,
      [gameId]: totalPoints
    }));

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
          const previousTotal = mondayNightTotals[gameId];
          setMondayNightTotals(prev => ({
            ...prev,
            [gameId]: previousTotal
          }));
        }
      } catch (err) {
        console.error("Error saving total score:", err);
        alert("Error saving total score. Please try again.");
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

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>;

  const maxWeek = games.length > 0 ? Math.max(...games.map((g) => g.week)) : 0;
  const currentWeekNum = activeWeek ?? 1;

  const getWeekStatusColor = (week: number) => {
  const weekGames = gamesByWeek[week] || [];

  if (activeWeek === week) {
    return "bg-green-600 text-white border-green-700";
  }

  const allGamesFinal =
    weekGames.length > 0 && weekGames.every((g) => g.status === "Final");

  if (allGamesFinal) {
    return "bg-red-500 text-white border-red-600";
  }

  return "bg-blue-500 text-white border-blue-600";
};

  const navItems = [
    { href: "/", label: "Home", icon: "🏠" },
    { href: "/all-picks", label: "View All Picks", icon: "📊" },
    { href: "/pick-summary", label: "Pick Percentages", icon: "📈" },
    { href: "/standings", label: "Standings", icon: "🏆" },
    { href: "/pickem-groups", label: "Pick'em Groups", icon: "👥" },
    { href: "/rules", label: "Rules", icon: "📋" },
    { href: "/profile", label: "Profile", icon: "👤" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setHeaderExpanded(!headerExpanded)}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 bg-gray-100 border border-gray-300"
            >
              <span className="text-xl text-gray-800">{headerExpanded ? "✕" : "☰"}</span>
              <span className="font-semibold text-gray-800 hidden sm:block">
                {headerExpanded ? "Close Menu" : "Menu"}
              </span>
            </button>
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
                  disabled={updatingScores}
                  className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition-colors text-xs disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {updatingScores ? 'Updating...' : 'Update ESPN API'}
                </button>
                <button
                  onClick={debugUserPicks}
                  className="bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600 transition-colors text-xs"
                >
                  Debug User Picks
                </button>
                <button
                  onClick={toggleDebugActive}
                  className={`px-3 py-1 rounded transition-colors text-xs ${
                    debugActive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  {debugActive ? 'Stop Debug' : 'Start Debug'}
                </button>
              </div>
            )}
            
            {isAdmin && (
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 transition-colors text-xs"
              >
                {showDebug ? 'Hide Debug' : 'Show Debug'}
              </button>
            )}

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                {userEmail?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-gray-700">{userEmail}</p>
                <p className="text-xs text-gray-500">{isAdmin ? 'Admin' : 'User'}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="bg-red-500 text-white px-3 py-2 rounded text-sm font-medium hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Navigation Panel */}
        {headerExpanded && (
          <div className="absolute top-full left-0 w-80 bg-white border-b border-r border-gray-200 shadow-lg z-40">
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
                    </div>
                    <span className="text-gray-400 group-hover:text-blue-500 transition-colors">→</span>
                  </Link>
                ))}
              </div>

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
        {/* Debug Panel */}
        {showDebug && isAdmin && (
          <div className="mb-6 p-4 bg-gray-100 border border-gray-300 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-lg">Debug Info</h3>
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
                  Clear
                </button>
              </div>
            </div>
            <div className="text-sm font-mono max-h-64 overflow-y-auto bg-black text-green-400 p-3 rounded">
              {debugInfo.length === 0 ? (
                <div className="text-gray-500">
                  {debugActive ? 'No debug info yet.' : 'Debug logging inactive.'}
                </div>
              ) : (
                debugInfo.map((info, index) => (
                  <div key={index} className="border-b border-gray-700 py-1">{info}</div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Weekly Lock Indicator */}
        {activeWeek && (
          <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg max-w-2xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⏰</span>
                <div>
                  <h3 className="font-bold text-blue-800">Week {activeWeek} Lock Rules</h3>
                  <p className="text-sm text-blue-700">
                    {(() => {
                      const weekLockTime = getWeekLockTimeForCurrentWeek();
                      if (weekLockTime) {
                        // Get the earliest Sunday 2:00 PM game
                        const earliestAfternoonGame = gamesByWeek[activeWeek]
                          ?.filter(g => {
                            const gameTime = new Date(g.start_time);
                            return gameTime.getDay() === 0 && gameTime.getHours() >= 14;
                          })
                          ?.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
                        
                        const earliestTime = earliestAfternoonGame ? formatTime(earliestAfternoonGame.start_time) : '';
                        
                        return (
                          <>
                            • Thursday/Friday/Saturday games: Lock individually<br/>
                            • Sunday games before 2:00 PM MST: Lock individually<br/>
                            • All Sunday games at or after 2:00 PM MST: Lock when {earliestAfternoonGame?.awayTeam} @ {earliestAfternoonGame?.homeTeam} starts ({earliestTime})<br/>
                            • Monday Night Football: Locks when {earliestAfternoonGame?.awayTeam} @ {earliestAfternoonGame?.homeTeam} starts
                          </>
                        );
                      } else {
                        return (
                          <>
                            • Thursday/Friday/Saturday games: Lock individually<br/>
                            • Sunday games: All lock individually<br/>
                            • Monday Night Football: Locks individually
                          </>
                        );
                      }
                    })()}
                  </p>
                </div>
              </div>
              {(() => {
                const weekLockTime = getWeekLockTimeForCurrentWeek();
                
                if (!weekLockTime) {
                  // Check if all games are finished
                  if (isWeekComplete()) {
                    return (
                      <div className="bg-green-500 text-white px-4 py-2 rounded font-bold">
                        WEEK COMPLETE
                      </div>
                    );
                  }
                  
                  // No Sunday 2:00 PM games this week - all lock individually
                  return (
                    <div className="text-right">
                      <div className="font-bold text-blue-800">Individual Locks</div>
                      <div className="text-sm text-blue-700">All games lock individually</div>
                    </div>
                  );
                }
                
                const diff = weekLockTime.getTime() - now.getTime();
                if (diff <= 0) {
                  return (
                    <div className="bg-red-500 text-white px-4 py-2 rounded font-bold">
                      WEEK LOCKED
                    </div>
                  );
                }
                
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const mins = Math.floor((diff / (1000 * 60)) % 60);
                const secs = Math.floor((diff / 1000) % 60);
                return (
                  <div className="text-right">
                    <div className="font-bold text-blue-800">Earliest Sunday 2 PM:</div>
                    <div className="text-lg font-bold text-blue-900">
                      {hours}h {mins}m {secs}s
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        <div className="text-center mb-8">
        <div className="inline-block bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-5 rounded-2xl shadow-lg">
          <h2 className="text-4xl font-extrabold tracking-tight">
            🏈 Make Your Picks
          </h2>

          <p className="text-blue-100 mt-2 text-lg font-semibold">
            Season {selectedSeason} • Week {activeWeek ?? "-"}
          </p>
        </div>
      </div>

        {/* Week Wheel Selector */}
        <div className="mb-8 flex justify-center">
          <div className="bg-white border border-gray-300 rounded-2xl shadow-lg p-5 w-full max-w-md">
            <label className="block text-lg font-extrabold text-gray-800 mb-3 text-center">
              Select Week
            </label>

            <select
              value={activeWeek ?? ""}
              onChange={(e) => handleWeekSelect(Number(e.target.value))}
              className={`w-full px-4 py-4 rounded-xl border-2 font-extrabold text-center text-xl focus:outline-none focus:ring-4 focus:ring-blue-300 ${getWeekStatusColor(
                activeWeek ?? currentWeekNum
              )}`}
            >
              {Array.from({ length: maxWeek }, (_, i) => i + 1).map((week) => {
                const weekGames = gamesByWeek[week] || [];
                const allGamesFinal =
                  weekGames.length > 0 && weekGames.every((g) => g.status === "Final");

                const label =
                  activeWeek === week
                    ? `🟢 Week ${week} Current`
                    : allGamesFinal
                    ? `🔴 Week ${week} Passed`
                    : `🔵 Week ${week} Coming`;

                return (
                  <option key={week} value={week}>
                    {label}
                  </option>
                );
              })}
            </select>

            <div className="flex justify-center gap-3 mt-4 text-xs font-bold">
              <span className="text-green-600">🟢 Current</span>
              <span className="text-red-600">🔴 Passed</span>
              <span className="text-blue-600">🔵 Coming</span>
            </div>
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
            const currentTotal = mondayNightTotals[g.id];
            const userHasSetTotal = currentTotal !== null && currentTotal !== undefined && currentTotal > 0;
            const actualTotal = g.home_score != null && g.away_score != null ? g.home_score + g.away_score : null;
            const pickCorrect = isFinal && pick ? (pick === g.winner ? true : false) : null;
            const mondayNightButtonsDisabled = isMondayNight && !isFinal && !locked && !userHasSetTotal;
            const pickedTeamStyle = getTeamStyle(pick);
            const homeStyle = getTeamStyle(g.homeTeam);
            const awayStyle = getTeamStyle(g.awayTeam);

            const teamColors: Record<string, string> = {
              ARI: "bg-red-700 text-white border-red-800",
              ATL: "bg-red-600 text-white border-red-700",
              BAL: "bg-purple-700 text-white border-purple-800",
              BUF: "bg-blue-700 text-white border-blue-800",
              CAR: "bg-sky-500 text-white border-sky-600",
              CHI: "bg-orange-700 text-white border-orange-800",
              CIN: "bg-orange-500 text-black border-orange-600",
              CLE: "bg-orange-800 text-white border-orange-900",
              DAL: "bg-blue-800 text-white border-blue-900",
              DEN: "bg-orange-600 text-white border-orange-700",
              DET: "bg-blue-500 text-white border-blue-600",
              GB: "bg-green-700 text-yellow-200 border-green-800",
              HOU: "bg-blue-900 text-white border-blue-950",
              IND: "bg-blue-700 text-white border-blue-800",
              JAX: "bg-teal-700 text-white border-teal-800",
              KC: "bg-red-600 text-yellow-200 border-red-700",
              LAC: "bg-yellow-400 text-blue-900 border-yellow-500",
              LAR: "bg-blue-700 text-yellow-300 border-blue-800",
              LV: "bg-gray-900 text-white border-gray-950",
              MIA: "bg-teal-500 text-white border-teal-600",
              MIN: "bg-purple-700 text-yellow-300 border-purple-800",
              NE: "bg-blue-800 text-white border-blue-900",
              NO: "bg-yellow-600 text-black border-yellow-700",
              NYG: "bg-blue-700 text-white border-blue-800",
              NYJ: "bg-green-700 text-white border-green-800",
              PHI: "bg-emerald-800 text-white border-emerald-900",
              PIT: "bg-yellow-400 text-black border-yellow-500",
              SEA: "bg-green-500 text-blue-950 border-green-600",
              SF: "bg-red-700 text-yellow-300 border-red-800",
              TB: "bg-red-700 text-white border-red-800",
              TEN: "bg-sky-700 text-white border-sky-800",
              WAS: "bg-red-900 text-yellow-300 border-red-950",
            };

            const getTeamColor = (team: string) => {
              return teamColors[team] || "bg-blue-600 text-white border-blue-700";
            };

            const teamBtn = (team: string) => {
              const teamStyle = getTeamStyle(team);
              const selected = pick === team;

              let base =
                "px-6 py-3 rounded-xl font-extrabold transition-all text-center min-w-[95px] border-4 shadow-lg transform";

              if (mondayNightButtonsDisabled) {
                return `${base} cursor-not-allowed opacity-50`;
              }

              if (selected && !isFinal) {
                return `${base} scale-110 ring-4 ring-white`;
              }

              if (selected && isFinal) {
                return `${base} scale-110 ring-4 ${
                  pickCorrect ? "ring-green-300" : "ring-red-300"
                }`;
              }

              if (locked && !selected) {
                return `${base} opacity-50 cursor-not-allowed`;
              }

              return `${base} hover:scale-110 hover:shadow-2xl cursor-pointer`;
            };

            return (
            <div
              key={g.id}

              className="
              rounded-3xl
              p-2
              mb-8
              max-w-2xl
              mx-auto
              w-full
              transition-all
              duration-500
              "

              style={{
                background: pick
                  ? `linear-gradient(
                      135deg,
                      ${pickedTeamStyle.primary},
                      ${pickedTeamStyle.secondary}
                    )`
                  : "linear-gradient(135deg,#ffffff,#f5f5f5)",

                boxShadow: pick
                  ? `
                    0 0 0 10px ${pickedTeamStyle.secondary},
                    0 0 60px ${pickedTeamStyle.primary},
                    0 30px 70px rgba(0,0,0,.35)
                  `
                  : `
                    0 20px 40px rgba(0,0,0,.18)
                  `,
              }}
            >

            <div
              className="
              rounded-2xl
              p-6
              flex
              flex-col
              gap-4
              "

              style={{
                background: pick
                  ? `linear-gradient(
                      145deg,
                      ${pickedTeamStyle.primary},
                      ${pickedTeamStyle.secondary}
                    )`
                  : "#ffffff",

                color: pick
                  ? pickedTeamStyle.text
                  : "#111827",
              }}
            >              
                {/* Game Header */}
                <div className="flex flex-col items-center text-center gap-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="font-extrabold text-2xl sm:text-3xl tracking-wide px-5 py-3 rounded-xl shadow-lg border-2"
                      style={{
                        background: pick
                          ? "rgba(255,255,255,0.18)"
                          : "linear-gradient(135deg, #111827, #374151)",
                        color: "#ffffff",
                        borderColor: pick ? "rgba(255,255,255,0.45)" : "#111827",
                        textShadow: "0 2px 4px rgba(0,0,0,0.35)",
                      }}
                    >
                      {g.awayTeam} @ {g.homeTeam}
                    </div>
                    {isMondayNight && (
                      <span className="bg-purple-500 text-white px-2 py-1 rounded text-xs font-bold">
                        MNF
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <div className={`font-semibold text-lg ${
                      isLive ? "text-green-600" : isFinal ? "text-gray-800" : "text-blue-600"
                    }`}>
                      {isFinal ? "FINAL" : isLive ? "LIVE" : "UPCOMING"}
                    </div>
                  </div>

                  {/* Final Score */}
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

                  {/* Monday Night Total Input */}
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
                            min="1"
                            max="100"
                            value={currentTotal ?? ''}
                            onChange={(e) => handleMondayNightTotalChange(g.id, e.target.value)}
                            className="w-24 px-3 py-2 border-2 border-purple-300 rounded text-center font-bold text-lg text-purple-800 bg-white"
                            placeholder="Enter total"
                            disabled={savingScore === g.id}
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
                    </div>
                  )}

                  {/* Pick Result */}
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
                </div>

                {/* Team Selection */}
                {!isFinal && (
                  <div className="flex justify-center items-center gap-3">
                    <div className="flex flex-wrap justify-center gap-3">
                      <button
                        disabled={locked || mondayNightButtonsDisabled}
                        onClick={() => selectPick(g.id, g.homeTeam, g.start_time, isMondayNight)}
                        className={teamBtn(g.homeTeam)}
                        title={mondayNightButtonsDisabled ? "Set total points first" : ""}
                      >
                        {g.homeTeam}
                      </button>
                      <button
                        disabled={locked || mondayNightButtonsDisabled}
                        onClick={() => selectPick(g.id, g.awayTeam, g.start_time, isMondayNight)}
                        className={teamBtn(g.awayTeam)}
                        title={mondayNightButtonsDisabled ? "Set total points first" : ""}
                      >
                        {g.awayTeam}
                      </button>
                    </div>
                  </div>
                )}

                {/* Countdown */}
                {!isFinal && !isLive && (
                  <div className="flex justify-center">
                    <div
                      className="
                      font-black
                      px-6
                      py-4
                      rounded-2xl
                      border-4
                      text-center
                      shadow-xl
                      max-w-md
                      w-full
                      "
                      style={{
                        background: pick
                          ? "rgba(255,255,255,.20)"
                          : "#fee2e2",

                        color: pick
                          ? "#ffffff"
                          : "#991b1b",

                        borderColor: pick
                          ? "rgba(255,255,255,.45)"
                          : "#fecaca",

                        textShadow: pick
                          ? "0 2px 8px rgba(0,0,0,.5)"
                          : "none",
                      }}
                    >
                      <div className="text-sm uppercase tracking-widest opacity-90">
                        Game Start Time
                      </div>

                      <div className="text-xl sm:text-2xl mt-1">
                        🕒 {formatTime(g.start_time)} MST
                      </div>

                      <div className="mt-3 text-sm uppercase tracking-widest opacity-90">
                        Pick Lock Countdown
                      </div>

                      <div className="text-lg sm:text-xl mt-1">
                        {getLockMessage(new Date(g.start_time), g.id)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            );
          })}
      </main>
    </div>
  );
};

export default MakePicksPage;