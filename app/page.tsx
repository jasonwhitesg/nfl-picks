"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentWeekGames, setCurrentWeekGames] = useState<Game[]>([]);
  const [currentWeekSummary, setCurrentWeekSummary] = useState<PicksSummary[]>([]);
  const [currentWeek, setCurrentWeek] = useState<number>(1);
  const [seasonYear, setSeasonYear] = useState<number>(2026);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.push("/login");
        return;
      }

      setUserEmail(data.session.user.email || null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("email", data.session.user.email)
        .single();

      setIsAdmin(profile?.is_admin || false);

      await fetchData();
    };

    checkAuthAndFetch();
  }, [router]);

  const fetchData = async () => {
    setLoading(true);

    try {
      const { data: config, error: configError } = await supabase
        .from("season_config")
        .select("season_year, current_week")
        .single();

      if (configError) throw configError;

      const activeSeason = config?.season_year ?? 2026;
      const activeWeek = config?.current_week ?? 1;

      setSeasonYear(activeSeason);
      setCurrentWeek(activeWeek);

      const { data: games, error } = await supabase
        .from("games")
        .select("*")
        .eq("season", activeSeason)
        .eq("week", activeWeek)
        .order("start_time", { ascending: true });

      if (error) throw error;

      const filteredGames = (games || []).filter(
        (g: any) =>
          g.team_a &&
          g.team_b &&
          g.team_a.trim() !== "" &&
          g.team_b.trim() !== "" &&
          g.team_a.toLowerCase() !== "bye" &&
          g.team_b.toLowerCase() !== "bye"
      );

      const mappedGames: Game[] = filteredGames.map((g: any) => {
        let status = g.status;
        let winner = g.winner;

        if (!status && g.home_score != null && g.away_score != null) {
          status = "Final";
          winner = g.home_score > g.away_score ? g.team_a : g.team_b;
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
        };
      });

      setCurrentWeekGames(mappedGames);

      const summaries: PicksSummary[] = await Promise.all(
        mappedGames.map(async (game) => {
          const { data: picks } = await supabase
            .from("game_picks")
            .select("selected_team")
            .eq("game_id", game.id);

          const total = picks?.length || 0;

          const homeCount =
            picks?.filter((p: any) => p.selected_team === game.homeTeam).length ||
            0;

          const awayCount =
            picks?.filter((p: any) => p.selected_team === game.awayTeam).length ||
            0;

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
      console.error("Error fetching home page data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

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

  const getPickSummary = (gameId: string) => {
    return currentWeekSummary.find((summary) => summary.game_id === gameId);
  };

  const navItems = [
    { href: "/make-picks", label: "Make Picks", icon: "🏈" },
    { href: "/all-picks", label: "View All Picks", icon: "📊" },
    { href: "/pick-summary", label: "Pick Percentages", icon: "📈" },
    { href: "/standings", label: "Standings", icon: "🏆" },
    { href: "/pickem-groups", label: "Pick'em Groups", icon: "👥" },
    { href: "/rules", label: "Rules", icon: "📋" },
    { href: "/profile", label: "Profile", icon: "👤" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setHeaderExpanded(!headerExpanded)}
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 bg-gray-100 border border-gray-300"
              title={headerExpanded ? "Collapse menu" : "Expand menu"}
            >
              <span className="text-xl text-gray-800">
                {headerExpanded ? "✕" : "☰"}
              </span>
              <span className="font-semibold text-gray-800 hidden sm:block">
                {headerExpanded ? "Close Menu" : "Menu"}
              </span>
            </button>

            <h1 className="text-2xl font-bold text-gray-800">NFL Picks</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                {userEmail?.charAt(0).toUpperCase()}
              </div>

              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-gray-700">{userEmail}</p>
                <p className="text-xs text-gray-500">
                  {isAdmin ? "Admin" : "User"} · Season {seasonYear}
                </p>
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

        {headerExpanded && (
          <div className="absolute top-full left-0 w-80 bg-white border-b border-r border-gray-200 shadow-lg z-40">
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">
                  Navigation
                </h2>
                <p className="text-sm text-gray-600">
                  Quick access to all features
                </p>
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

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-800 mb-3">
                  Current Week Stats
                </h3>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-blue-600">
                      {currentWeekGames.length}
                    </div>
                    <div className="text-xs text-blue-800">Games</div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-green-600">
                      {
                        currentWeekSummary.filter(
                          (g) => g.homePercent + g.awayPercent > 0
                        ).length
                      }
                    </div>
                    <div className="text-xs text-green-800">With Picks</div>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-purple-600">
                      {currentWeek}
                    </div>
                    <div className="text-xs text-purple-800">Week</div>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-600">🔧</span>
                    <span className="text-sm font-semibold text-yellow-800">
                      Admin Mode Active
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="p-6">
        <div className="text-center mb-12 max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            NFL Picks Dashboard
          </h1>
          <p className="text-lg text-gray-600">
            Make your weekly NFL picks and see how others are voting. Track your
            performance and compete with friends!
          </p>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4 mb-12 max-w-2xl mx-auto">
          <Link
            href="/make-picks"
            className="flex flex-col items-center justify-center gap-3 rounded-xl bg-blue-500 text-white p-6 font-semibold hover:bg-blue-600 transition-all duration-200 hover:scale-105 shadow-lg"
          >
            <span className="text-3xl">🏈</span>
            <span className="text-lg">Make Picks</span>
            <span className="text-sm opacity-90">Select your winners</span>
          </Link>

          <Link
            href="/all-picks"
            className="flex flex-col items-center justify-center gap-3 rounded-xl bg-green-500 text-white p-6 font-semibold hover:bg-green-600 transition-all duration-200 hover:scale-105 shadow-lg"
          >
            <span className="text-3xl">📊</span>
            <span className="text-lg">View All Picks</span>
            <span className="text-sm opacity-90">See everyone's picks</span>
          </Link>

          <Link
            href="/pick-summary"
            className="flex flex-col items-center justify-center gap-3 rounded-xl bg-purple-500 text-white p-6 font-semibold hover:bg-purple-600 transition-all duration-200 hover:scale-105 shadow-lg"
          >
            <span className="text-3xl">📈</span>
            <span className="text-lg">Pick Percentages</span>
            <span className="text-sm opacity-90">View voting trends</span>
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            Week {currentWeek} Games & Pick Percentages
          </h2>

          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <p className="text-gray-600 mt-2">Loading current week data...</p>
            </div>
          ) : currentWeekGames.length === 0 ? (
            <p className="text-gray-600 text-center py-8">
              No games scheduled for this week.
            </p>
          ) : (
            <div className="space-y-6">
              {currentWeekGames.map((game) => {
                const isFinal = game.status === "Final";
                const isLive = game.status === "InProgress";
                const pickSummary = getPickSummary(game.id);

                return (
                  <div
                    key={game.id}
                    className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-all duration-200 bg-white"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-3">
                      <div className="font-semibold text-gray-800 text-xl">
                        {game.awayTeam} @ {game.homeTeam}
                      </div>

                      <div
                        className={`text-sm font-medium px-3 py-1 rounded-full ${
                          isFinal
                            ? "bg-gray-100 text-gray-600"
                            : isLive
                            ? "bg-green-100 text-green-600"
                            : "bg-blue-100 text-blue-600"
                        }`}
                      >
                        {isFinal ? "FINAL" : isLive ? "LIVE" : "UPCOMING"}
                      </div>
                    </div>

                    <div className="text-sm text-gray-600 mb-4 font-medium">
                      {formatTime(game.start_time)}
                    </div>

                    {isFinal &&
                      game.home_score !== null &&
                      game.away_score !== null && (
                        <div className="text-lg font-bold text-gray-800 mb-4 p-3 bg-gray-50 rounded-lg border">
                          Final: {game.awayTeam} {game.away_score} -{" "}
                          {game.homeTeam} {game.home_score}
                        </div>
                      )}

                    {pickSummary ? (
                      <div className="border-t pt-4">
                        <div className="text-sm font-semibold text-gray-700 mb-3">
                          Pick Percentages:
                        </div>

                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600">
                              {pickSummary.awayTeam}
                            </span>

                            <div className="flex items-center gap-3">
                              <div className="w-24 bg-gray-200 rounded-full h-3">
                                <div
                                  className="bg-blue-500 h-3 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${pickSummary.awayPercent}%`,
                                  }}
                                ></div>
                              </div>

                              <span className="text-sm font-bold min-w-10 text-blue-600">
                                {pickSummary.awayPercent}%
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-600">
                              {pickSummary.homeTeam}
                            </span>

                            <div className="flex items-center gap-3">
                              <div className="w-24 bg-gray-200 rounded-full h-3">
                                <div
                                  className="bg-red-500 h-3 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${pickSummary.homePercent}%`,
                                  }}
                                ></div>
                              </div>

                              <span className="text-sm font-bold min-w-10 text-red-600">
                                {pickSummary.homePercent}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="border-t pt-4">
                        <div className="text-sm text-gray-500 text-center bg-gray-50 py-3 rounded-lg">
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

        <div className="mt-8 bg-white rounded-xl shadow-lg p-6 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            Quick Stats
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-3xl font-bold text-blue-600">
                {currentWeekGames.length}
              </div>
              <div className="text-gray-700 font-medium">Games This Week</div>
            </div>

            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-3xl font-bold text-green-600">
                {
                  currentWeekSummary.filter(
                    (g) => g.homePercent + g.awayPercent > 0
                  ).length
                }
              </div>
              <div className="text-gray-700 font-medium">Games With Picks</div>
            </div>

            <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-3xl font-bold text-purple-600">
                {currentWeek}
              </div>
              <div className="text-gray-700 font-medium">Current Week</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
