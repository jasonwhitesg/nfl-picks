"use client";
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveScores } from "@/lib/useLiveScores";
import GameDetailSheet from "@/components/GameDetailSheet";
import PicksLogo from "@/components/PicksLogo";
import { periodLabel } from "@/lib/espnLive";
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
  // A ref (not state) so the 30-second refresh always sees the latest choice
  const userSelectedWeek = useRef(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number>(2026);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  // Live scores, clock and win % for the week on screen
  const live = useLiveScores(selectedSeason, activeWeek);
  // Keep the selected week chip in view (only when the week changes)
  const weekChipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = weekChipsRef.current;
    const chip = row?.querySelector<HTMLElement>("[data-selected]");
    if (row && chip) row.scrollLeft = chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2;
  }, [activeWeek, games.length]);
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
          }
        }
      } else if (profile) {
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
      } else if (error) {
        console.error("Error loading picks:", error);
      }
    };
    fetchPicksAndTotals();
  }, [userId]);
  const fetchGames = async () => {
    const seasonYear = selectedSeason;
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .eq("season", seasonYear)
      .order("start_time", { ascending: true });
    if (error) {
      console.error("Error loading games:", error);
      return;
    }
    // Filter out any games with null teams or bye weeks
    const filteredData = data.filter((g: any) => 
      g.team_a && g.team_b && 
      g.team_a.trim() !== '' && g.team_b.trim() !== '' &&
      g.team_a.toLowerCase() !== 'bye' && g.team_b.toLowerCase() !== 'bye'
    );
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
    // Kickoff times determine the displayed week even if old statuses are stale.
    if (!userSelectedWeek.current) {
      const weekNumbers = Array.from(new Set(mapped.map(g => g.week))).sort((a, b) => a - b);
      const currentWeek = weekNumbers.find(week =>
        mapped.some(game => game.week === week && new Date(game.start_time).getTime() > Date.now())
      ) ?? weekNumbers[weekNumbers.length - 1] ?? 1;
      setActiveWeek(currentWeek);
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
  const handleWeekSelect = (week: number) => {
    userSelectedWeek.current = true;
    setActiveWeek(week);
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
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-slate-600">Loading...</div>
    );
  }

  const weekNumbers = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b);
  const weekGames = activeWeek ? gamesByWeek[activeWeek] || [] : [];
  const pickedCount = weekGames.filter((g) => picks[g.id]).length;
  const weekLockTime = getWeekLockTimeForCurrentWeek();
  const lockGame = weekLockTime
    ? weekGames.find((g) => new Date(g.start_time).getTime() === weekLockTime.getTime())
    : undefined;
  const cleanLockMessage = (msg: string) => msg.replace(/^⏰\s*/, "");

  const countdown = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  };

  // When a game's pick locks: its own kickoff, or the Sunday 2 PM group lock
  // for late-Sunday and Monday games (same rule as getCountdown above)
  const lockTimeFor = (g: Game): Date => {
    const kickoff = new Date(g.start_time);
    const day = kickoff.getDay();
    if (weekLockTime && ((day === 0 && kickoff.getHours() >= 14) || day === 1)) return weekLockTime;
    return kickoff;
  };

  const clock = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((n) => String(n).padStart(2, "0"))
      .join(":");
    return d > 0 ? `${d}d ${hms}` : hms;
  };

  const renderGame = (g: Game) => {
    const locked = isLocked(g.start_time);
    const pick = picks[g.id];
    const liveGame = live[g.id];
    const state = liveGame?.state ?? (g.status === "Final" ? "post" : g.status === "InProgress" ? "in" : "pre");
    const isFinal = state === "post";
    const isLive = state === "in";
    const isMondayNight = g.is_monday_night;
    const homeScore = liveGame?.home.score ?? g.home_score ?? null;
    const awayScore = liveGame?.away.score ?? g.away_score ?? null;
    const currentTotal = mondayNightTotals[g.id];
    const userHasSetTotal = currentTotal !== null && currentTotal !== undefined && currentTotal > 0;
    const actualTotal = homeScore != null && awayScore != null ? homeScore + awayScore : null;
    const needsTotalFirst = isMondayNight && !locked && !userHasSetTotal;
    const winner = isFinal ? g.winner ?? null : null;
    const homePct = isLive ? liveGame?.homeWinPct ?? null : null;

    const side = (team: string, label: "Away" | "Home", score: number | null) => {
      const selected = pick === team;
      const otherPicked = !!pick && !selected;
      const style = getTeamStyle(team);
      const correct = isFinal && selected && winner === team;
      const wrong = isFinal && selected && winner !== team;
      const disabled = locked || needsTotalFirst;

      return (
        <button
          type="button"
          disabled={disabled}
          onClick={() => selectPick(g.id, team, g.start_time, isMondayNight)}
          aria-pressed={selected}
          className={`relative flex flex-1 flex-col items-center justify-center gap-1 px-3 py-6 transition-all duration-300 ${
            selected ? "z-10 scale-[1.02] shadow-lg" : ""
          } ${otherPicked ? "opacity-45" : ""} ${disabled ? "cursor-default" : "cursor-pointer hover:bg-slate-50"}`}
          style={
            selected
              ? { background: `linear-gradient(145deg, ${style.primary}, ${style.secondary})`, color: style.text }
              : { background: "#ffffff", color: "#0f172a" }
          }
        >
          <span className={`text-[11px] font-bold uppercase tracking-widest ${selected ? "opacity-90" : "text-slate-600"}`}>
            {label}
          </span>
          <span className="text-4xl font-black tracking-tight">{team}</span>
          {state !== "pre" && (
            <span className={`text-2xl font-extrabold tabular-nums ${selected ? "" : "text-slate-800"}`}>
              {score ?? "–"}
            </span>
          )}
          {selected && (
            <span
              className={`mt-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                correct
                  ? "bg-emerald-500 text-white"
                  : wrong
                  ? "bg-rose-600 text-white"
                  : "bg-white/25 backdrop-blur"
              }`}
            >
              {correct ? "✓ Correct" : wrong ? "✗ Missed" : "Your pick"}
            </span>
          )}
        </button>
      );
    };

    return (
      <article
        key={g.id}
        className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
      >
        {/* Top line: kickoff + lock status */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            {formatTime(g.start_time)} MT
            {isMondayNight && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">MNF</span>
            )}
          </div>
          {isLive ? (
            <span className="flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
              {liveGame ? `${periodLabel(liveGame.period)} ${liveGame.clock ?? ""}`.trim() : "LIVE"}
            </span>
          ) : isFinal ? (
            <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-800">
              {liveGame?.detail?.toUpperCase() || "FINAL"}
            </span>
          ) : locked ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">🔒 Locked</span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">Open</span>
          )}
        </div>

        {/* The two "pages": away | home */}
        <div className="relative flex">
          {side(g.awayTeam, "Away", awayScore)}
          {/* Spine */}
          <div className="pointer-events-none absolute inset-y-3 left-1/2 z-20 w-px -translate-x-1/2 bg-slate-200" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-sm">
            @
          </div>
          {side(g.homeTeam, "Home", homeScore)}
        </div>

        {/* Live win % */}
        {homePct !== null && (
          <div className="px-4 pt-3">
            <div className="mb-1 flex justify-between text-[11px] font-bold text-slate-700">
              <span>{Math.round(100 - homePct)}%</span>
              <span className="font-semibold text-slate-600">chance to win</span>
              <span>{Math.round(homePct)}%</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="transition-all duration-700"
                style={{ width: `${100 - homePct}%`, background: getTeamStyle(g.awayTeam).primary }}
              />
              <div
                className="transition-all duration-700"
                style={{ width: `${homePct}%`, background: getTeamStyle(g.homeTeam).primary }}
              />
            </div>
          </div>
        )}

        {/* Monday Night total */}
        {isMondayNight && (
          <div className="mx-4 mt-3 rounded-2xl bg-indigo-50 p-3">
            {!locked && !isFinal ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-indigo-900">Monday total points</span>
                  {!userHasSetTotal && (
                    <span className="text-xs font-semibold text-indigo-700">Set this before picking</span>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleMondayNightTotalChange(g.id, String(Math.max(1, (currentTotal ?? 45) - 1)))}
                    className="h-11 w-11 rounded-xl bg-white text-xl font-bold text-indigo-900 shadow-sm hover:bg-indigo-100"
                    aria-label="Lower total"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={150}
                    value={currentTotal ?? ""}
                    onChange={(e) => handleMondayNightTotalChange(g.id, e.target.value)}
                    placeholder="45"
                    disabled={savingScore === g.id}
                    className="h-11 w-24 rounded-xl border border-indigo-200 text-center text-2xl font-extrabold text-indigo-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => handleMondayNightTotalChange(g.id, String(Math.min(150, (currentTotal ?? 44) + 1)))}
                    className="h-11 w-11 rounded-xl bg-white text-xl font-bold text-indigo-900 shadow-sm hover:bg-indigo-100"
                    aria-label="Raise total"
                  >
                    +
                  </button>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-3 text-center">
                <div>
                  <div className="text-2xl font-extrabold text-indigo-900">{userHasSetTotal ? currentTotal : "—"}</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">Your total</div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-indigo-900">{state === "pre" ? "—" : actualTotal ?? "—"}</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                    {isFinal ? "Actual" : "So far"}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-extrabold text-indigo-900">
                    {userHasSetTotal && actualTotal !== null && state !== "pre"
                      ? Math.abs((currentTotal as number) - actualTotal)
                      : "—"}
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
                    {isFinal ? "Off by" : "Away from it"}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Countdown: to the pick lock, or to kickoff once picks are locked */}
        {state === "pre" &&
          (() => {
            const kickoffMs = new Date(g.start_time).getTime() - now.getTime();
            const lockAt = lockTimeFor(g);
            const lockMs = lockAt.getTime() - now.getTime();
            const urgent = !locked && lockMs < 60 * 60 * 1000;
            return (
              <div
                className={`mx-4 mt-3 flex items-center justify-between rounded-2xl px-4 py-3 ${
                  locked ? "bg-slate-100" : urgent ? "bg-rose-50 ring-1 ring-rose-200" : "bg-emerald-50 ring-1 ring-emerald-200"
                }`}
              >
                <div>
                  <div
                    className={`text-xs font-bold uppercase tracking-wide ${
                      locked ? "text-slate-700" : urgent ? "text-rose-700" : "text-emerald-800"
                    }`}
                  >
                    {locked ? "🔒 Locked · kickoff in" : "Picks lock in"}
                  </div>
                  {!locked && lockAt.getTime() !== new Date(g.start_time).getTime() && (
                    <div className="text-[11px] font-medium text-slate-700">
                      With the {lockGame ? `${lockGame.awayTeam} @ ${lockGame.homeTeam}` : "first Sunday 2 PM"} kickoff
                    </div>
                  )}
                </div>
                <div
                  className={`font-mono text-2xl font-extrabold tabular-nums ${
                    locked ? "text-slate-900" : urgent ? "text-rose-700" : "text-emerald-800"
                  }`}
                >
                  {clock(locked ? kickoffMs : lockMs)}
                </div>
              </div>
            );
          })()}

        {/* Bottom line: status + details */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-xs font-semibold text-slate-600">
            {isFinal
              ? winner
                ? `${winner} won`
                : "Tie game"
              : isLive
              ? liveGame?.downDistance ?? "In progress"
              : pick
              ? `You picked ${pick}`
              : locked
              ? "No pick made"
              : "Tap a team to pick"}
          </span>
          <button
            type="button"
            onClick={() => setSelectedGameId(g.id)}
            className="shrink-0 rounded-full border border-slate-300 px-3 py-1 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-100"
          >
            Details
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 pb-14 pt-5">
          <div className="flex items-center gap-3">
            <PicksLogo className="h-12 w-12" />
            <div>
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight">Make Picks</h1>
              <p className="text-sm text-slate-300">
                Season {selectedSeason} · Week {activeWeek ?? "–"}
              </p>
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 font-bold">
            {userEmail?.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-10 max-w-2xl space-y-4 px-4 pb-6">
        {/* Progress + week lock */}
        {activeWeek && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-600">Your picks this week</div>
                <div className="text-2xl font-extrabold text-slate-900">
                  {pickedCount}
                  <span className="text-lg text-slate-500"> / {weekGames.length}</span>
                </div>
              </div>
              <div className="text-right">
                {isWeekComplete() ? (
                  <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-bold text-slate-800">Week complete</span>
                ) : weekLockTime && weekLockTime.getTime() > now.getTime() ? (
                  <>
                    <div className="text-xs font-semibold text-slate-600">Sunday 2 PM + MNF lock in</div>
                    <div className="font-mono text-lg font-extrabold text-emerald-700">
                      {countdown(weekLockTime.getTime() - now.getTime())}
                    </div>
                  </>
                ) : weekLockTime ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">
                    🔒 Sunday & MNF locked
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-slate-600">Each game locks at kickoff</span>
                )}
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${weekGames.length ? (pickedCount / weekGames.length) * 100 : 0}%` }}
              />
            </div>
            <details className="group mt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-slate-600">
                How picks lock <span className="transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>Thursday, Friday and Saturday games lock at their own kickoff.</li>
                <li>Sunday games before 2:00 PM MT lock at their own kickoff.</li>
                <li>
                  Sunday games at or after 2:00 PM, and Monday Night, all lock when
                  {lockGame ? ` ${lockGame.awayTeam} @ ${lockGame.homeTeam} ` : " the first of those games "}
                  kicks off.
                </li>
                <li>Set your Monday Night total points before picking that game.</li>
              </ul>
            </details>
          </section>
        )}

        {/* Week chips */}
        <div ref={weekChipsRef} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {weekNumbers.map((week) => {
            const wg = gamesByWeek[week] || [];
            const done = wg.length > 0 && wg.every((g) => g.status === "Final");
            const selected = activeWeek === week;
            return (
              <button
                key={week}
                data-selected={selected || undefined}
                onClick={() => handleWeekSelect(week)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  selected
                    ? "bg-emerald-600 text-white shadow-sm"
                    : done
                    ? "border border-slate-200 bg-white text-slate-500"
                    : "border border-slate-200 bg-white text-slate-800 hover:border-emerald-300"
                }`}
              >
                Week {week}
              </button>
            );
          })}
        </div>

        {/* Games */}
        <div className="space-y-4">{weekGames.map(renderGame)}</div>
      </main>

      {(() => {
        const g = games.find((game) => game.id === selectedGameId);
        return (
          <GameDetailSheet
            game={
              g
                ? {
                    id: g.id,
                    homeTeam: g.homeTeam,
                    awayTeam: g.awayTeam,
                    startTime: g.start_time,
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
export default MakePicksPage;
