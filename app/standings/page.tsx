"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { computeStandings, weeklyPot, type Standing } from "@/lib/standings";

// $55, $18.33
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
import { fetchAll } from "@/lib/fetchAll";

type WinnerRow = {
  week: number;
  player_name: string;
  correct_picks: number;
  tiebreaker: number | null;
  is_paid_winner: boolean;
  is_tied: boolean;
};

const medal = ["🥇", "🥈", "🥉"];

export default function StandingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [finalGames, setFinalGames] = useState(0);
  const [me, setMe] = useState<string | null>(null);
  const [paidPlayersByWeek, setPaidPlayersByWeek] = useState<Record<number, number>>({});

  // Who's signed in, and which season to show first
  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setMe(user.id);
      const { data: config } = await supabase.from("season_config").select("season_year").single();
      const current = config?.season_year ?? 2026;
      setSeasons(Array.from(new Set([current, 2025])).sort((a, b) => b - a));
      setSeason(current);
    };
    init();
  }, [router]);

  // Load and score the chosen season
  useEffect(() => {
    if (!season) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data: gameRows, error: gameError } = await supabase
          .from("games")
          .select("id, start_time, winner, status")
          .eq("season", season);
        if (gameError) throw gameError;
        const games = (gameRows || []).map((g) => ({
          id: g.id,
          startTime: g.start_time,
          winner: g.winner,
          status: g.status,
        }));
        const decidedIds = games.filter((g) => g.status === "Final" && g.winner).map((g) => g.id);

        // Every pick on this season's decided games, paged past the 1,000-row limit
        const picks = decidedIds.length
          ? await fetchAll<{ user_id: string; game_id: string; selected_team: string }>((from, to) =>
              supabase
                .from("game_picks")
                .select("user_id, game_id, selected_team")
                .in("game_id", decidedIds)
                .order("id")
                .range(from, to)
            )
          : [];

        const { data: players } = await supabase.from("profiles").select("user_id, username, first_name, last_name");
        const { data: winnerRows } = await supabase
          .from("weekly_winners")
          .select("week, player_name, correct_picks, tiebreaker, is_paid_winner, is_tied")
          .eq("season", season)
          .order("week", { ascending: false });

        // Paid players per week decide each week's pot ($5 each)
        const { data: paidRows } = await supabase
          .from("weekly_payments")
          .select("week_number")
          .eq("season_year", season)
          .eq("is_paid", true);
        const paidByWeek: Record<number, number> = {};
        for (const p of paidRows || []) paidByWeek[p.week_number] = (paidByWeek[p.week_number] ?? 0) + 1;

        setPaidPlayersByWeek(paidByWeek);
        setWinners(winnerRows || []);
        setFinalGames(decidedIds.length);
        setStandings(computeStandings(games, picks, players || [], winnerRows || [], paidByWeek));
      } catch (err) {
        console.error("Error loading standings:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [season]);

  const totalPaid = standings.reduce((sum, s) => sum + s.winnings, 0);

  return (
    <div className="min-h-screen bg-page">
      <PageHeader title="Standings" subtitle={season ? `Season ${season}` : ""} icon="🏆" />

      <main className="mx-auto -mt-10 max-w-3xl space-y-4 px-4 pb-6">
        {/* Season switch */}
        <div className="flex gap-2">
          {seasons.map((s) => (
            <button
              key={s}
              onClick={() => setSeason(s)}
              className={`rounded-full px-4 py-2 text-sm font-bold shadow-sm transition-colors ${
                season === s ? "bg-white text-slate-900 ring-2 ring-sky-500" : "bg-white/70 text-slate-800 hover:bg-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-700 shadow-sm">
            Loading standings...
          </div>
        ) : (
          <>
            {/* Summary */}
            <section className="grid grid-cols-3 gap-3">
              {[
                { n: standings.length, label: "Players" },
                { n: finalGames, label: "Games final" },
                { n: money(totalPaid), label: "Paid out" },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-2xl font-extrabold text-slate-900">{s.n}</div>
                  <div className="text-xs font-semibold text-slate-700">{s.label}</div>
                </div>
              ))}
            </section>

            {/* Leaderboard */}
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                <span>#</span>
                <span>Player</span>
                <span className="text-right">Record</span>
                <span className="w-14 text-right">Won</span>
              </div>
              {standings.length === 0 ? (
                <p className="px-4 py-8 text-center text-slate-700">No finished games yet this season.</p>
              ) : (
                <ol>
                  {standings.map((s, i) => (
                    <li
                      key={s.user_id}
                      className={`grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 ${
                        s.user_id === me ? "bg-sky-50" : ""
                      }`}
                    >
                      <span className="text-center text-xl font-extrabold text-slate-800">{medal[i] ?? i + 1}</span>
                      <div className="min-w-0">
                        <div className="truncate font-bold text-slate-900">
                          {s.username}
                          {s.user_id === me && <span className="ml-1 text-xs font-bold text-sky-700">YOU</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs font-medium text-slate-700">
                          {s.name && <span className="truncate">{s.name}</span>}
                          {s.currentStreak >= 3 && <span className="font-bold text-orange-600">🔥 {s.currentStreak} in a row</span>}
                          <span>Best run {s.bestStreak}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.percentage}%` }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold tabular-nums text-slate-900">
                          {s.correct}–{s.wrong}
                        </div>
                        <div className="text-xs font-semibold text-slate-700">{s.percentage}%</div>
                      </div>
                      <div className="w-14 text-right">
                        <div className={`font-extrabold ${s.winnings > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                          {money(s.winnings)}
                        </div>
                        <div className="text-xs font-semibold text-slate-700">
                          {s.weeklyWins} {s.weeklyWins === 1 ? "win" : "wins"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Weekly winners */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-lg font-bold text-slate-900">Weekly winners</h2>
              {winners.length === 0 ? (
                <p className="text-sm text-slate-700">No weeks decided yet. Winners save automatically after Monday Night.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {winners.map((w) => (
                    <li key={`${w.week}-${w.player_name}`} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="w-16 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-center text-xs font-bold text-slate-800">
                          Week {w.week}
                        </span>
                        <span className="font-bold text-slate-900">
                          {w.is_paid_winner ? "🏆 " : ""}
                          {w.player_name}
                        </span>
                        {!w.is_paid_winner && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                            would have won
                          </span>
                        )}
                        {w.is_tied && (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-900">shared</span>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-slate-700">
                        {w.is_paid_winner && paidPlayersByWeek[w.week] ? `${money(weeklyPot(paidPlayersByWeek[w.week]))} pot · ` : ""}{w.correct_picks} right{w.tiebreaker != null ? ` · ${w.tiebreaker} off` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
