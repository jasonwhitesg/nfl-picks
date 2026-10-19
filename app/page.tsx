"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import SplashScreen from "@/components/SplashScreen";
import PicksLogo from "@/components/PicksLogo";
import GroupInvites from "@/components/GroupInvites";
import { splitMemberships } from "@/lib/groups";
import { loadMemberships } from "@/lib/groupActions";

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
  total: number;
};

const menuTiles = [
  { href: "/all-picks", label: "All Picks", desc: "See everyone's picks", icon: "📊", tint: "bg-sky-100" },
  { href: "/pick-summary", label: "Percentages", desc: "Voting trends", icon: "📈", tint: "bg-violet-100" },
  { href: "/standings", label: "Standings", desc: "Who's winning", icon: "🏆", tint: "bg-amber-100" },
  { href: "/pickem-groups", label: "Groups", desc: "Pick'em groups", icon: "👥", tint: "bg-rose-100" },
  { href: "/rules", label: "Rules", desc: "How it works", icon: "📋", tint: "bg-slate-200" },
  { href: "/profile", label: "Profile", desc: "Your account", icon: "👤", tint: "bg-emerald-100" },
];

export default function Home() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentWeekGames, setCurrentWeekGames] = useState<Game[]>([]);
  const [currentWeekSummary, setCurrentWeekSummary] = useState<PicksSummary[]>([]);
  const [currentWeek, setCurrentWeek] = useState<number>(1);
  const [seasonYear, setSeasonYear] = useState<number>(2026);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<ReturnType<typeof splitMemberships>>({
    invites: [],
    joined: [],
    requested: [],
  });

  // Group invites and memberships for the signed-in player
  const loadGroups = async (uid: string, season: number) => {
    try {
      setGroups(splitMemberships(await loadMemberships(uid), season));
    } catch (err) {
      console.error("Error loading groups:", err);
    }
  };

  useEffect(() => {
    if (userId) loadGroups(userId, seasonYear);
  }, [userId, seasonYear]);

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.push("/login");
        return;
      }

      setUserEmail(data.session.user.email || null);
      setUserId(data.session.user.id);

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

      // One request for the whole week instead of one per game
      const ids = mappedGames.map((g) => g.id);
      let pickRows: { game_id: string; selected_team: string }[] = [];

      if (ids.length > 0) {
        const { data: picks, error: picksError } = await supabase
          .from("game_picks")
          .select("game_id, selected_team")
          .in("game_id", ids);

        if (picksError) throw picksError;
        pickRows = picks || [];
      }

      const summaries: PicksSummary[] = mappedGames.map((game) => {
        const gamePicks = pickRows.filter((p) => p.game_id === game.id);
        const total = gamePicks.length;
        const homeCount = gamePicks.filter(
          (p) => p.selected_team === game.homeTeam
        ).length;
        const homePercent = total > 0 ? Math.round((homeCount / total) * 100) : 0;

        return {
          game_id: game.id,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          homePercent,
          awayPercent: total > 0 ? 100 - homePercent : 0,
          total,
        };
      });

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

  const getPickSummary = (gameId: string) =>
    currentWeekSummary.find((s) => s.game_id === gameId);

  const gamesWithPicks = currentWeekSummary.filter((g) => g.total > 0).length;

  if (loading) return <SplashScreen message="Loading your picks..." />;

  return (
    <div className="min-h-screen bg-page">
      {/* Header */}
      <header className="sticky top-[env(safe-area-inset-top)] z-50 bg-ink text-white shadow-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <PicksLogo className="h-9 w-9" />
            <div>
              <h1 className="text-lg font-extrabold leading-tight tracking-tight">
                NFL Picks
              </h1>
              <p className="text-xs text-slate-400">
                Season {seasonYear} · Week {currentWeek}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-200">{userEmail}</p>
              <p className="text-xs text-slate-400">{isAdmin ? "Admin" : "Player"}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 font-bold text-white">
              {userEmail?.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {/* Primary action */}
        <Link
          href="/make-picks"
          className="flex items-center justify-between rounded-2xl bg-emerald-600 p-5 text-white shadow-lg transition-colors hover:bg-emerald-700 active:scale-[0.99]"
        >
          <div className="flex items-center gap-4">
            <span className="text-4xl">🏈</span>
            <div>
              <div className="text-xl font-extrabold">Make Your Picks</div>
              <div className="text-sm text-emerald-100">
                Week {currentWeek} · {currentWeekGames.length} games
              </div>
            </div>
          </div>
          <span className="text-2xl">→</span>
        </Link>

        {/* Group invites + your groups */}
        {userId && (
          <div className="mt-4">
            <GroupInvites
              userId={userId}
              invites={groups.invites}
              joined={groups.joined}
              requested={groups.requested}
              onChange={() => loadGroups(userId, seasonYear)}
            />
          </div>
        )}

        {/* Menu grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {menuTiles.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md active:scale-[0.98]"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${tile.tint}`}
              >
                {tile.icon}
              </span>
              <div className="min-w-0">
                <div className="truncate font-bold text-slate-800">{tile.label}</div>
                <div className="truncate text-xs text-slate-500">{tile.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* This week */}
        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="text-xl font-extrabold text-slate-800">
              Week {currentWeek} Games
            </h2>
            <p className="text-sm text-slate-500">
              {gamesWithPicks} of {currentWeekGames.length} have picks
            </p>
          </div>

          {currentWeekGames.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              No games scheduled for this week.
            </div>
          ) : (
            <div className="space-y-3">
              {currentWeekGames.map((game) => {
                const isFinal = game.status === "Final";
                const isLive = game.status === "InProgress";
                const summary = getPickSummary(game.id);
                const hasPicks = !!summary && summary.total > 0;

                return (
                  <div
                    key={game.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-bold text-slate-800">
                          {game.awayTeam} @ {game.homeTeam}
                        </div>
                        <div className="text-sm text-slate-500">
                          {formatTime(game.start_time)}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                          isFinal
                            ? "bg-slate-100 text-slate-600"
                            : isLive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-sky-100 text-sky-700"
                        }`}
                      >
                        {isFinal ? "FINAL" : isLive ? "LIVE" : "UPCOMING"}
                      </span>
                    </div>

                    {isFinal && game.home_score != null && game.away_score != null && (
                      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800">
                        {game.awayTeam} {game.away_score} – {game.homeTeam} {game.home_score}
                      </div>
                    )}

                    <div className="mt-4">
                      {hasPicks && summary ? (
                        <>
                          <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
                            <span>
                              {summary.awayTeam} {summary.awayPercent}%
                            </span>
                            <span>
                              {summary.homePercent}% {summary.homeTeam}
                            </span>
                          </div>
                          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="bg-slate-700 transition-all duration-500"
                              style={{ width: `${summary.awayPercent}%` }}
                            />
                            <div
                              className="bg-emerald-500 transition-all duration-500"
                              style={{ width: `${summary.homePercent}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="rounded-xl bg-slate-50 py-2 text-center text-xs text-slate-400">
                          No picks made for this game yet
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
