"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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

type PicksSummary = {
  game_id: string;
  homeTeam: string;
  awayTeam: string;
  homePercent: number;
  awayPercent: number;
};

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [currentWeekGames, setCurrentWeekGames] = useState<Game[]>([]);
  const [currentWeekSummary, setCurrentWeekSummary] = useState<PicksSummary[]>([]);
  const [currentWeek, setCurrentWeek] = useState<number>(1);

  function getNowMST(): Date {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Denver" })
    );
  }

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        // Fetch all games
        const { data: games, error } = await supabase
          .from("games")
          .select("*")
          .order("start_time", { ascending: true });

        if (error) throw error;
        if (!games) return;

        // Map games with proper timezone conversion
        const mappedGames: Game[] = games.map((g: any) => {
          let status = g.status;
          let winner = g.winner;
          const estDate = new Date(g.start_time);
          const mstDate = new Date(estDate.getTime() - 2 * 60 * 60 * 1000); // EST → MST

          if (!status && g.home_score != null && g.away_score != null) {
            status = "Final";
            winner = g.home_score > g.away_score ? g.team_a : g.team_b;
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
          };
        });

        // Determine current week (upcoming games)
        const now = getNowMST();
        const upcomingWeek = [...new Set(mappedGames.map((g) => g.week))]
          .sort((a, b) => a - b)
          .find((w) =>
            mappedGames.some(
              (g) => g.week === w && new Date(g.start_time) > now
            )
          );

        const activeWeek = upcomingWeek ?? Math.max(...mappedGames.map((g) => g.week));
        setCurrentWeek(activeWeek);

        // Set current week games
        const weekGames = mappedGames.filter(g => g.week === activeWeek);
        setCurrentWeekGames(weekGames);

        // Fetch pick percentages for CURRENT WEEK games only
        const summaries: PicksSummary[] = await Promise.all(
          weekGames.map(async (game) => {
            const { data: picks } = await supabase
              .from("game_picks")
              .select("selected_team")
              .eq("game_id", game.id);

            const total = picks?.length || 0;
            const homeCount = picks?.filter((p: any) => p.selected_team === game.homeTeam).length || 0;
            const awayCount = picks?.filter((p: any) => p.selected_team === game.awayTeam).length || 0;

            return {
              game_id: game.id,
              homeTeam: game.homeTeam,
              awayTeam: game.awayTeam,
              homePercent: total > 0 ? Math.round((homeCount / total) * 100) : 0,
              awayPercent: total > 0 ? Math.round((awayCount / total) * 100) : 0,
            };
          })
        );

        setCurrentWeekSummary(summaries);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            NFL Picks Dashboard
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Make your weekly NFL picks and see how others are voting. 
            Track your performance and compete with friends!
          </p>
        </div>

        {/* Navigation buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12">
          <Link
            href="/make-picks"
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-500 text-white px-6 font-semibold hover:bg-blue-600 transition-colors"
          >
            Make Picks
          </Link>

          <Link
            href="/all-picks"
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-green-500 text-white px-6 font-semibold hover:bg-green-600 transition-colors"
          >
            View All Picks
          </Link>

          <Link
            href="/pick-summary"
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-purple-500 text-white px-6 font-semibold hover:bg-purple-600 transition-colors"
          >
            Pick Percentages
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Current Week Games */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Week {currentWeek} Games
            </h2>
            {loading ? (
              <p className="text-gray-600">Loading current week games...</p>
            ) : currentWeekGames.length === 0 ? (
              <p className="text-gray-600">No games scheduled for this week.</p>
            ) : (
              <div className="space-y-4">
                {currentWeekGames.map((game) => {
                  const isFinal = game.status === "Final";
                  const isLive = game.status === "InProgress";
                  const isUpcoming = !isFinal && !isLive;
                  
                  return (
                    <div key={game.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-semibold text-gray-800">
                          {game.awayTeam} @ {game.homeTeam}
                        </div>
                        <div className={`text-sm font-medium ${
                          isFinal ? "text-gray-600" : 
                          isLive ? "text-green-600" : 
                          "text-blue-600"
                        }`}>
                          {isFinal ? "FINAL" : isLive ? "LIVE" : "UPCOMING"}
                        </div>
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatTime(game.start_time)}
                      </div>
                      {isFinal && game.home_score !== null && game.away_score !== null && (
                        <div className="text-sm font-semibold text-gray-800 mt-2">
                          Final: {game.awayTeam} {game.away_score} - {game.homeTeam} {game.home_score}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Current Week Pick Percentages */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              Week {currentWeek} Pick Percentages
            </h2>
            {loading ? (
              <p className="text-gray-600">Loading pick percentages...</p>
            ) : currentWeekSummary.length === 0 ? (
              <p className="text-gray-600">No picks made for this week yet.</p>
            ) : (
              <div className="space-y-3">
                {currentWeekSummary.map((g) => (
                  <div key={g.game_id} className="border border-gray-200 rounded-lg p-3">
                    <div className="font-semibold text-gray-800 mb-2">
                      {g.awayTeam} @ {g.homeTeam}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{g.awayTeam}</span>
                      <span className="text-sm font-semibold">{g.awayPercent}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">{g.homeTeam}</span>
                      <span className="text-sm font-semibold">{g.homePercent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Quick Stats</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{currentWeekGames.length}</div>
              <div className="text-gray-600">Games This Week</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">
                {currentWeekSummary.filter(g => g.homePercent + g.awayPercent > 0).length}
              </div>
              <div className="text-gray-600">Games With Picks</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">{currentWeek}</div>
              <div className="text-gray-600">Current Week</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
