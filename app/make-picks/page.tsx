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
};

type Picks = Record<string, string | null>;

const MakePicksPage = () => {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Picks>({});
  const [now, setNow] = useState<Date>(new Date());
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

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
        .select("user_id")
        .eq("email", data.session.user.email)
        .single();
      if (!error) setUserId(profile.user_id);
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    const fetchPicks = async () => {
      const { data, error } = await supabase
        .from("game_picks")
        .select("game_id, selected_team")
        .eq("user_id", userId);
      if (!error && data) {
        const picksMap: Picks = {};
        data.forEach((p: any) => (picksMap[p.game_id] = p.selected_team));
        setPicks(picksMap);
      }
    };
    fetchPicks();
  }, [userId]);

  const fetchGames = async () => {
    const { data, error } = await supabase
      .from("games")
      .select("*")
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching games:", error.message);
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
      // If your database time is actually UTC, subtract 7 hours to get MST
      // If it's already MST, don't subtract anything
      const utcDate = new Date(g.start_time);
      const mstDate = new Date(utcDate.getTime() - 7 * 60 * 60 * 1000); // UTC → MST

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
        start_time: mstDate.toISOString(), // Store as MST
        home_score: g.home_score,
        away_score: g.away_score,
        winner,
        status,
      };
    });

    setGames(mapped);

    // Find the upcoming week (first week with future games)
    const upcomingWeek = [...new Set(mapped.map((g) => g.week))]
      .sort((a, b) => a - b)
      .find((w) =>
        mapped.some(
          (g) => g.week === w && new Date(g.start_time) > now
        )
      );

    setActiveWeek(upcomingWeek ?? Math.max(...mapped.map((g) => g.week)));
  };

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 180000); // Refresh every 3 minutes
    return () => clearInterval(interval);
  }, [now]); // Add now as dependency

  const formatTime = (iso: string) => {
    // The time is already stored as MST, so we can format it directly
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

  const isLocked = (isoDate: string) => new Date(isoDate) <= now;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const selectPick = async (gameId: string, team: string, lockTime: string) => {
    if (isLocked(lockTime)) {
      alert("This game is locked. You cannot change your pick.");
      return;
    }

    // Update local state immediately for better UX
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
          is_locked: false
        }, {
          onConflict: 'user_id,game_id'
        });

      if (error) {
        console.error("Error saving pick:", error);
        setPicks((prev) => ({ ...prev, [gameId]: picks[gameId] }));
        alert("Error saving your pick. Please try again.");
      }
    } catch (err) {
      console.error("Error saving pick:", err);
      setPicks((prev) => ({ ...prev, [gameId]: picks[gameId] }));
      alert("Error saving your pick. Please try again.");
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
        <div className="flex items-center gap-4">
          <Link 
            href="/all-picks" 
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
          >
            View All Picks
          </Link>
          
          {userEmail && <span className="text-gray-700">{userEmail}</span>}
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

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
                onClick={() => setActiveWeek(week)}
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

          const pickCorrect =
            isFinal && pick ? (pick === g.winner ? true : false) : null;

          const teamBtn = (team: string) => {
            let base =
              "px-4 py-2 rounded-md font-semibold transition-all text-center min-w-[80px]";

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
                <div className="font-bold text-xl sm:text-2xl truncate w-full text-gray-800">
                  {g.awayTeam} @ {g.homeTeam}
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
                  </div>
                )}

                {/* Show lock status message */}
                {locked && pick && (
                  <div className="bg-yellow-100 border border-yellow-300 rounded-lg px-4 py-2 mt-2">
                    <div className="text-sm font-semibold text-yellow-800">
                      Your pick is locked: {pick}
                    </div>
                  </div>
                )}
              </div>

              {/* Middle section: Team selection buttons - Centered */}
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