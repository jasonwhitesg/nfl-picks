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
  status?: string | null; // Scheduled | InProgress | Final
};

type Picks = Record<string, string | null>;

const MakePicksPage = () => {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Picks>({});
  const [now, setNow] = useState(new Date());
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [mondayTotal, setMondayTotal] = useState<number | null>(null);

  // ---- Auth check ----
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

      if (error) {
        console.error("Error fetching profile:", error.message);
        return;
      }

      setUserId(profile.user_id);
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  // ---- Fetch picks ----
  useEffect(() => {
    if (!userId) return;

    const fetchPicks = async () => {
      const { data, error } = await supabase
        .from("game_picks")
        .select("game_id, selected_team")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching picks:", error.message);
        return;
      }

      const picksMap: Picks = {};
      data?.forEach((p: any) => (picksMap[p.game_id] = p.selected_team));
      setPicks(picksMap);
    };

    fetchPicks();
  }, [userId]);

  // ---- Fetch games ----
  useEffect(() => {
    const fetchGames = async () => {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .order("start_time", { ascending: true });

      if (error) {
        console.error("Error fetching games:", error.message);
        return;
      }

      const mapped: Game[] = data.map((g: any) => ({
        id: g.id,
        week: g.week,
        homeTeam: g.team_b,
        awayTeam: g.team_a,
        start_time: g.start_time,
        home_score: g.home_score,
        away_score: g.away_score,
        winner: g.winner,
        status: g.status,
      }));

      setGames(mapped);

      // default to current week
      const currentWeek =
        [...new Set(mapped.map((g) => g.week))].sort((a, b) => a - b)[0] ?? 1;
      setActiveWeek(currentWeek);
    };

    fetchGames();
  }, []);

  // ---- Utility functions ----
  const isLocked = (isoDate: string) => new Date(isoDate) <= now;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Denver",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  const getCountdown = (iso: string) => {
    const diff = new Date(iso).getTime() - now.getTime();
    if (diff <= 0) return "";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return `${hours}h ${mins}m`;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // ---- Select a team ----
  const selectPick = async (gameId: string, team: string, lockTime: string) => {
    if (isLocked(lockTime)) {
      alert("This game is locked.");
      return;
    }

    setPicks((prev) => ({ ...prev, [gameId]: team }));

    if (!userId) return;

    await supabase
      .from("game_picks")
      .upsert({
        user_id: userId,
        game_id: gameId,
        selected_team: team,
        lock_time: lockTime,
      });
  };

  // ---- Save Monday total ----
  const saveMondayTotal = async () => {
    if (!userId || mondayTotal === null) return;
    const mondayGame = games.find(
      (g) => g.week === activeWeek && new Date(g.start_time).getDay() === 1
    );
    if (!mondayGame) return;

    await supabase.from("monday_totals").upsert({
      user_id: userId,
      week: activeWeek,
      total_points: mondayTotal,
    });

    alert("Monday total saved!");
  };

  // ---- Organize by week ----
  const gamesByWeek: Record<number, Game[]> = {};
  games.forEach((g) => {
    if (!gamesByWeek[g.week]) gamesByWeek[g.week] = [];
    gamesByWeek[g.week].push(g);
  });

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex justify-between mb-6">
        <h1 className="text-3xl font-bold">NFL Weekly Picks</h1>
        <div className="flex items-center gap-4">
          {userEmail && <span>{userEmail}</span>}
          <button
            onClick={handleLogout}
            className="bg-red-500 text-white px-4 py-2 rounded"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Week Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {Object.keys(gamesByWeek)
          .map(Number)
          .sort((a, b) => a - b)
          .map((week) => (
            <button
              key={week}
              onClick={() => setActiveWeek(week)}
              className={`px-4 py-2 rounded ${
                week === activeWeek ? "bg-blue-500 text-white" : "bg-gray-200"
              }`}
            >
              Week {week}
            </button>
          ))}
      </div>

      {/* Games */}
      {activeWeek &&
        gamesByWeek[activeWeek]?.map((g) => {
          const locked = isLocked(g.start_time);
          const pick = picks[g.id];
          const isFinal = g.status === "Final";
          const isLive = g.status === "InProgress";

          const teamBtn = (team: string, picked: boolean) =>
            `px-4 py-2 rounded ${
              picked ? "bg-blue-500 text-white" : "bg-gray-100"
            } ${locked ? "opacity-50 cursor-not-allowed" : ""}`;

          return (
            <div
              key={g.id}
              className="border p-4 mb-4 rounded flex flex-col gap-2"
            >
              <div className="flex justify-between items-center">
                <div className="font-semibold">
                  {g.awayTeam} @ {g.homeTeam}
                </div>
                <div className="text-sm text-gray-500">{formatTime(g.start_time)}</div>
              </div>

              <div className="text-sm">
                {isFinal && (
                  <span className="text-green-700 font-semibold">
                    Final — {g.away_score} - {g.home_score} ({g.winner} won)
                  </span>
                )}
                {isLive && <span className="text-orange-600 font-semibold">In Progress</span>}
                {!isFinal && !isLive && (
                  <span className="text-gray-500">Starts in {getCountdown(g.start_time)}</span>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  disabled={locked}
                  onClick={() => selectPick(g.id, g.homeTeam, g.start_time)}
                  className={teamBtn(g.homeTeam, pick === g.homeTeam)}
                >
                  {g.homeTeam}
                </button>
                <button
                  disabled={locked}
                  onClick={() => selectPick(g.id, g.awayTeam, g.start_time)}
                  className={teamBtn(g.awayTeam, pick === g.awayTeam)}
                >
                  {g.awayTeam}
                </button>
              </div>
            </div>
          );
        })}

      {/* Monday Night Total */}
      <div className="border rounded p-4 bg-gray-50 mt-6">
        <h2 className="font-semibold mb-2">Monday Night Total Points</h2>
        <input
          type="number"
          value={mondayTotal ?? ""}
          onChange={(e) => setMondayTotal(Number(e.target.value))}
          className="border p-2 rounded mr-2 w-24"
        />
        <button
          onClick={saveMondayTotal}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Save
        </button>
      </div>
    </div>
  );
};

export default MakePicksPage;

