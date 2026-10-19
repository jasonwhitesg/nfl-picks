"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getTeamStyle } from "@/lib/teams";
import { computeSplits, sortSplits, type SplitPick, type SplitSort } from "@/lib/pickSplit";
import { splitMemberships, type GroupInfo } from "@/lib/groups";
import { loadMemberships } from "@/lib/groupActions";

type Game = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  week: number;
  winner?: string | null;
  status?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
};

const EVERYONE = "everyone";

export default function PickPercentagesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [seasonYear, setSeasonYear] = useState(2026);
  const [games, setGames] = useState<Game[]>([]);
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [weekPicks, setWeekPicks] = useState<SplitPick[]>([]);
  const [myGroups, setMyGroups] = useState<GroupInfo[]>([]);
  const [audience, setAudience] = useState<string>(EVERYONE);
  const [groupUserIds, setGroupUserIds] = useState<string[] | undefined>(undefined);
  const [sortBy, setSortBy] = useState<SplitSort>("time");
  const [myPicks, setMyPicks] = useState<Record<string, string>>({});
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }
        setUserId(user.id);

        const { data: config } = await supabase.from("season_config").select("season_year").single();
        const season = config?.season_year ?? 2026;
        setSeasonYear(season);

        const { joined } = splitMemberships(await loadMemberships(user.id), season);
        setMyGroups(joined);

        const { data: gameData } = await supabase
          .from("games")
          .select("id, week, start_time, team_a, team_b, winner, status, home_score, away_score")
          .eq("season", season)
          .order("start_time", { ascending: true });

        const mapped: Game[] = (gameData || [])
          .filter((g: any) => g.team_a && g.team_b && g.team_a.toLowerCase() !== "bye" && g.team_b.toLowerCase() !== "bye")
          .map((g: any) => ({
            id: g.id,
            week: g.week,
            startTime: g.start_time,
            homeTeam: g.team_a,
            awayTeam: g.team_b,
            winner: g.winner,
            status: g.status,
            homeScore: g.home_score,
            awayScore: g.away_score,
          }));
        setGames(mapped);

        // Current week = first week with a game still to be played
        const weeks = Array.from(new Set(mapped.map((g) => g.week))).sort((a, b) => a - b);
        const now = Date.now();
        setActiveWeek(
          weeks.find((w) => mapped.some((g) => g.week === w && (new Date(g.startTime).getTime() > now || g.status !== "Final"))) ??
            weeks[weeks.length - 1] ??
            1
        );
      } catch (err) {
        console.error("Error loading pick summary:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [router]);

  // Picks for just the week on screen (keeps us well under Supabase's 1,000-row limit)
  useEffect(() => {
    if (!activeWeek) return;
    const ids = games.filter((g) => g.week === activeWeek).map((g) => g.id);
    if (ids.length === 0) return;
    supabase
      .from("game_picks")
      .select("user_id, game_id, selected_team")
      .in("game_id", ids)
      .then(({ data, error }) => {
        if (error) console.error("Error loading picks:", error);
        const rows = data || [];
        setWeekPicks(rows);
        const mine: Record<string, string> = {};
        rows.filter((p) => p.user_id === userId).forEach((p) => (mine[p.game_id] = p.selected_team));
        setMyPicks(mine);
      });
  }, [activeWeek, games, userId]);

  // Approved members of the chosen group
  useEffect(() => {
    if (audience === EVERYONE) {
      setGroupUserIds(undefined);
      return;
    }
    supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", audience)
      .eq("status", "approved")
      .then(({ data }) => setGroupUserIds((data || []).map((m) => m.user_id)));
  }, [audience]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-page text-slate-700">Loading pick percentages...</div>;
  }

  const weeks = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b);
  const weekGames = games.filter((g) => g.week === activeWeek);
  const splits = sortSplits(computeSplits(weekGames, weekPicks, groupUserIds), sortBy);
  const players = new Set(weekPicks.filter((p) => !groupUserIds || groupUserIds.includes(p.user_id)).map((p) => p.user_id)).size;
  const finals = splits.filter((s) => s.favoriteWon !== null);
  const favoritesWon = finals.filter((s) => s.favoriteWon).length;

  const chip = (selected: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
      selected ? "bg-ink text-white shadow-sm" : "border border-slate-200 bg-white text-slate-800 hover:border-sky-400"
    }`;

  return (
    <div className="min-h-screen bg-page">
      <PageHeader title="Pick Percentages" subtitle={`Season ${seasonYear} · Week ${activeWeek ?? "–"}`} icon="📈" />

      <main className="mx-auto -mt-10 max-w-3xl space-y-4 px-4 pb-6">
        {/* Summary */}
        <section className="grid grid-cols-3 gap-3">
          {[
            { n: players, label: "Players picked" },
            { n: weekGames.length, label: "Games" },
            { n: finals.length ? `${favoritesWon}/${finals.length}` : "–", label: "Favorites won" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-2xl font-extrabold text-slate-900">{s.n}</div>
              <div className="text-xs font-semibold text-slate-700">{s.label}</div>
            </div>
          ))}
        </section>

        {/* Who to count */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <button onClick={() => setAudience(EVERYONE)} className={chip(audience === EVERYONE)}>
            Everyone
          </button>
          {myGroups.map((g) => (
            <button key={g.id} onClick={() => setAudience(g.id)} className={chip(audience === g.id)}>
              👥 {g.name}
            </button>
          ))}
        </div>

        {/* Weeks */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {weeks.map((w) => (
            <button key={w} onClick={() => setActiveWeek(w)} className={chip(activeWeek === w)}>
              Week {w}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-slate-700">Sort:</span>
          {(
            [
              ["time", "Kickoff"],
              ["lopsided", "Most one-sided"],
              ["closest", "Closest split"],
            ] as [SplitSort, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`rounded-full px-3 py-1 font-semibold ${
                sortBy === key ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300" : "text-slate-700 hover:bg-white/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Games */}
        <div className="space-y-3">
          {splits.map((s) => {
            const g = weekGames.find((x) => x.id === s.gameId)!;
            const away = getTeamStyle(s.awayTeam);
            const home = getTeamStyle(s.homeTeam);
            const isFinal = g.status === "Final";
            const isLive = g.status === "InProgress";
            const mine = myPicks[s.gameId];

            return (
              <article key={s.gameId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-lg font-extrabold text-slate-900">
                    {s.awayTeam} <span className="font-semibold text-slate-500">@</span> {s.homeTeam}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      isFinal ? "bg-slate-200 text-slate-800" : isLive ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-900"
                    }`}
                  >
                    {isFinal
                      ? g.awayScore != null && g.homeScore != null
                        ? `FINAL ${g.awayScore}–${g.homeScore}`
                        : "FINAL"
                      : isLive
                      ? "LIVE"
                      : new Date(g.startTime).toLocaleString("en-US", {
                          timeZone: "America/Denver",
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                  </span>
                </div>

                <div className="mt-3 flex items-end justify-between text-sm font-bold">
                  <span className="flex items-center gap-1.5 text-slate-900">
                    <span className="text-2xl font-black" style={{ color: away.primary }}>
                      {s.awayPct}%
                    </span>
                    {isFinal && g.winner === s.awayTeam && <span className="text-emerald-600">✓</span>}
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-900">
                    {isFinal && g.winner === s.homeTeam && <span className="text-emerald-600">✓</span>}
                    <span className="text-2xl font-black" style={{ color: home.primary }}>
                      {s.homePct}%
                    </span>
                  </span>
                </div>

                <div className="mt-1 flex h-4 overflow-hidden rounded-full bg-slate-100">
                  {s.totalPicks > 0 && (
                    <>
                      <div className="transition-all duration-500" style={{ width: `${s.awayPct}%`, background: away.primary }} />
                      <div className="transition-all duration-500" style={{ width: `${s.homePct}%`, background: home.primary }} />
                    </>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>
                    {s.awayTeam} · {s.awayPicks} {s.awayPicks === 1 ? "pick" : "picks"}
                  </span>
                  <span>
                    {s.homePicks} {s.homePicks === 1 ? "pick" : "picks"} · {s.homeTeam}
                  </span>
                </div>

                {(mine || s.favoriteWon === false) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {mine && (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-900">
                        You picked {mine}
                      </span>
                    )}
                    {s.favoriteWon === false && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                        😮 Upset: most players picked {s.favorite}
                      </span>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {myGroups.length === 0 && (
          <p className="text-center text-sm text-slate-700">
            Join a pick'em group to see how your group picked.{" "}
            <button onClick={() => router.push("/pickem-groups")} className="font-bold text-sky-800 underline">
              Groups
            </button>
          </p>
        )}
      </main>
    </div>
  );
}
