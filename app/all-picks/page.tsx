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
};

type Pick = {
  user_id: string;
  game_id: string;
  selected_team: string;
  lock_time: string;
};

type Profile = {
  user_id: string;
  email: string;
};

const AllPicksPage = () => {
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [now, setNow] = useState(new Date());
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // ---------- Fetch all data ----------
  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("user_id, email");
        setProfiles(profileData || []);

        const { data: gameData } = await supabase.from("games").select("*");
        const mappedGames: Game[] = (gameData || []).map((g: any) => ({
          id: g.id,
          week: g.week,
          startTime: g.start_time,
          homeTeam: g.team_b,
          awayTeam: g.team_a,
        }));
        const sortedGames = mappedGames.sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        setGames(sortedGames);

        const { data: pickData } = await supabase.from("game_picks").select("*");
        setPicks(pickData || []);

        // Determine current week based on Tuesday 5AM MT
        const nowMT = new Date().toLocaleString("en-US", { timeZone: "America/Denver" });
        const today = new Date(nowMT);
        const weekNumbers = Array.from(new Set(sortedGames.map((g) => g.week))).sort((a, b) => a - b);
        let currentWeek = weekNumbers[0];
        for (const week of weekNumbers) {
          const weekGames = sortedGames.filter((g) => g.week === week);
          if (!weekGames.length) continue;
          const firstGame = new Date(weekGames[0].startTime);
          const tuesday = new Date(firstGame);
          const day = tuesday.getDay();
          const diffToTuesday = (day <= 2 ? 2 - day : 9 - day);
          tuesday.setDate(tuesday.getDate() + diffToTuesday);
          tuesday.setHours(5, 0, 0, 0);
          if (today >= tuesday) currentWeek = week;
        }
        setActiveWeek(currentWeek);
        setLoading(false);
      } catch (err) {
        console.error("Error loading All Picks:", err);
      }
    };

    fetchData();
  }, []);

  // ---------- Timer (needed for locked games) ----------
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const isLocked = (isoDate: string) => {
    const gameET = new Date(isoDate);
    const gameMT = new Date(gameET.getTime() - 2 * 60 * 60 * 1000);
    return now.getTime() >= gameMT.getTime();
  };

  const formatGameLabel = (game: Game) => `${game.awayTeam} @ ${game.homeTeam}`;

  const gamesByWeek: Record<number, Game[]> = {};
  games.forEach((g) => {
    if (!gamesByWeek[g.week]) gamesByWeek[g.week] = [];
    gamesByWeek[g.week].push(g);
  });

  if (loading) return <div>Loading all picks...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header with Home and Make Picks links */}
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link 
            href="/" 
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors"
          >
            Home
          </Link>
          <Link 
            href="/make-picks" 
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          >
            Make Picks
          </Link>
        </div>
        <h1 className="text-3xl font-bold">All Player Picks</h1>
      </div>

      {/* Week tabs - UPDATED WITH BLUE STYLING */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {Object.keys(gamesByWeek).map((week) => (
          <button
            key={week}
            onClick={() => setActiveWeek(Number(week))}
            className={`px-4 py-2 rounded font-semibold transition-colors ${
              activeWeek === Number(week) 
                ? "bg-blue-500 text-white" 
                : "bg-blue-100 text-blue-700 hover:bg-blue-200"
            }`}
          >
            Week {week}
          </button>
        ))}
      </div>

      {activeWeek && (
        <div className="overflow-x-auto">
          <table className="table-auto border-collapse border border-gray-300 w-full text-center">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2">Player</th>
                {gamesByWeek[activeWeek].map((game) => (
                  <th key={game.id} className="border p-2">
                    {formatGameLabel(game)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Locked row */}
              <tr className="bg-gray-200 font-semibold">
                <td className="border p-2">Locked</td>
                {gamesByWeek[activeWeek].map((game) => {
                  const locked = isLocked(game.startTime);
                  return (
                    <td key={game.id} className="border p-2 text-center">
                      <span
                        className={`inline-block w-4 h-4 rounded-full ${
                          locked ? "bg-red-500" : "bg-green-300"
                        }`}
                        title={locked ? "Game started / Pick locked" : "Pick available"}
                      ></span>
                    </td>
                  );
                })}
              </tr>

              {/* Player picks - UPDATED TO HIDE PICKS UNTIL LOCKED */}
              {profiles.map((user) => (
                <tr key={user.user_id} className="hover:bg-gray-50">
                  <td className="border p-2 font-semibold">{user.email}</td>
                  {gamesByWeek[activeWeek].map((game) => {
                    const locked = isLocked(game.startTime);
                    const userPick = picks.find(
                      (p) => p.user_id === user.user_id && p.game_id === game.id
                    );
                    
                    // Only show pick if game is locked
                    const displayPick = locked ? (userPick?.selected_team ?? "") : "❓";
                    
                    return (
                      <td
                        key={game.id}
                        className={`border p-2 text-center font-medium ${
                          locked 
                            ? userPick 
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {displayPick}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-2">How it works:</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-green-300"></span>
            <span>Pick available (game hasn't started)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
            <span>Pick locked (game started)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">❓</span>
            <span>Pick hidden until game starts</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-green-100 text-green-800 px-2 py-1 rounded">Team</span>
            <span>Pick made</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-red-100 text-red-800 px-2 py-1 rounded">Empty</span>
            <span>No pick made</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AllPicksPage;


