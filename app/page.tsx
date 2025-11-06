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

        // FILTER OUT BYE WEEK GAMES - same as other pages
        const filteredGames = games.filter((g: any) => 
          g.team_a && g.team_b && 
          g.team_a.trim() !== '' && g.team_b.trim() !== '' &&
          g.team_a.toLowerCase() !== 'bye' && g.team_b.toLowerCase() !== 'bye'
        );

        // Map games with proper timezone conversion
        const mappedGames: Game[] = filteredGames.map((g: any) => {
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

  // Helper function to get pick summary for a specific game
  const getPickSummary = (gameId: string) => {
    return currentWeekSummary.find(summary => summary.game_id === gameId);
  };

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

        {/* Combined Games and Pick Percentages */}
        <div className="bg-white rounded-lg shadow-md p-6 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            Week {currentWeek} Games & Pick Percentages
          </h2>
          {loading ? (
            <p className="text-gray-600 text-center">Loading current week data...</p>
          ) : currentWeekGames.length === 0 ? (
            <p className="text-gray-600 text-center">No games scheduled for this week.</p>
          ) : (
            <div className="space-y-6">
              {currentWeekGames.map((game) => {
                const isFinal = game.status === "Final";
                const isLive = game.status === "InProgress";
                const isUpcoming = !isFinal && !isLive;
                const pickSummary = getPickSummary(game.id);
                
                return (
                  <div key={game.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    {/* Game Header */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="font-semibold text-gray-800 text-lg">
                        {game.awayTeam} @ {game.homeTeam}
                      </div>
                      <div className={`text-sm font-medium px-2 py-1 rounded ${
                        isFinal ? "bg-gray-100 text-gray-600" : 
                        isLive ? "bg-green-100 text-green-600" : 
                        "bg-blue-100 text-blue-600"
                      }`}>
                        {isFinal ? "FINAL" : isLive ? "LIVE" : "UPCOMING"}
                      </div>
                    </div>

                    {/* Game Time */}
                    <div className="text-sm text-gray-600 mb-3">
                      {formatTime(game.start_time)}
                    </div>

                    {/* Final Score (if available) */}
                    {isFinal && game.home_score !== null && game.away_score !== null && (
                      <div className="text-sm font-semibold text-gray-800 mb-3 p-2 bg-gray-50 rounded">
                        Final: {game.awayTeam} {game.away_score} - {game.homeTeam} {game.home_score}
                      </div>
                    )}

                    {/* Pick Percentages */}
                    {pickSummary && (
                      <div className="border-t pt-3">
                        <div className="text-sm font-semibold text-gray-700 mb-2">Pick Percentages:</div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">{pickSummary.awayTeam}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-500 h-2 rounded-full" 
                                  style={{ width: `${pickSummary.awayPercent}%` }}
                                ></div>
                              </div>
                              <span className="text-sm font-semibold min-w-8">{pickSummary.awayPercent}%</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">{pickSummary.homeTeam}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-red-500 h-2 rounded-full" 
                                  style={{ width: `${pickSummary.homePercent}%` }}
                                ></div>
                              </div>
                              <span className="text-sm font-semibold min-w-8">{pickSummary.homePercent}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* No Picks Message */}
                    {!pickSummary && (
                      <div className="border-t pt-3">
                        <div className="text-sm text-gray-500 text-center">
                          No picks made for this game yet
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Quick Stats</h2>
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
