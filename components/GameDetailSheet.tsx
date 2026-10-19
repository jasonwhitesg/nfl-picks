"use client";

import { useEffect, useState } from "react";
import type { GameSummary, LiveGame } from "@/lib/espnLive";
import { periodLabel } from "@/lib/espnLive";

export type SheetGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  // Fallback from our own games table when ESPN has nothing yet
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string | null;
};

type Props = {
  game: SheetGame | null;
  live?: LiveGame;
  onClose: () => void;
};

// Bottom sheet with score, clock, situation and win probability for one game
export default function GameDetailSheet({ game, live, onClose }: Props) {
  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const open = game !== null;

  // Load win % history; keep it fresh while the game is live
  useEffect(() => {
    if (!game) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setSummary(null);

    const load = async () => {
      try {
        const res = await fetch(`/api/live/${game.id}`);
        if (res.ok && !cancelled) setSummary(await res.json());
      } catch {
        // keep whatever we had
      }
      if (!cancelled && live?.state === "in") timer = setTimeout(load, 30_000);
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, live?.state]);

  // Tick for the kickoff countdown
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const state = live?.state ?? (game?.status === "Final" ? "post" : game?.status === "InProgress" ? "in" : "pre");
  const homeScore = live?.home.score ?? game?.homeScore ?? null;
  const awayScore = live?.away.score ?? game?.awayScore ?? null;
  const homeColor = live?.home.color ? `#${live.home.color}` : "#059669";
  const awayColor = live?.away.color ? `#${live.away.color}` : "#334155";

  // Current home win %: live value, else last point of history, else pregame prediction
  const history = summary?.homeWinHistory ?? [];
  const homePct =
    state === "post"
      ? homeScore !== null && awayScore !== null
        ? homeScore > awayScore
          ? 100
          : homeScore < awayScore
          ? 0
          : 50
        : null
      : live?.homeWinPct ?? (history.length ? history[history.length - 1] : summary?.pregameHomeWinPct ?? null);

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[90] bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-label="Game details"
        aria-hidden={!open}
        className={`fixed inset-x-0 bottom-0 z-[100] mx-auto max-h-[88vh] max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        {game && (
          <div className="p-5">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300" />

            {/* Status line */}
            <div className="mb-4 flex items-center justify-between">
              <StatusChip state={state} live={live} />
              <button
                onClick={onClose}
                className="rounded-full px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            {/* Scoreboard */}
            <div className="space-y-2">
              <TeamRow
                abbr={game.awayTeam}
                logo={live?.away.logo}
                score={awayScore}
                showScore={state !== "pre"}
                hasBall={live?.possession === game.awayTeam}
                leading={awayScore !== null && homeScore !== null && awayScore > homeScore}
              />
              <TeamRow
                abbr={game.homeTeam}
                logo={live?.home.logo}
                score={homeScore}
                showScore={state !== "pre"}
                hasBall={live?.possession === game.homeTeam}
                leading={awayScore !== null && homeScore !== null && homeScore > awayScore}
                home
              />
            </div>

            {/* Before kickoff: countdown */}
            {state === "pre" && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600">Kickoff</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{formatKickoff(game.startTime)}</div>
                <div className="mt-1 font-mono text-2xl font-extrabold text-emerald-700">
                  {formatCountdown(new Date(game.startTime).getTime() - now)}
                </div>
              </div>
            )}

            {/* Live: down & distance and last play */}
            {state === "in" && (live?.downDistance || live?.lastPlay) && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                {live?.downDistance && (
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    {live.downDistance}
                    {live.isRedZone && (
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">RED ZONE</span>
                    )}
                  </div>
                )}
                {live?.lastPlay && <p className="mt-1 text-sm text-slate-700">{live.lastPlay}</p>}
              </div>
            )}

            {/* Win probability */}
            {homePct !== null && (
              <div className="mt-5">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    {state === "pre" ? "Predicted to win" : state === "post" ? "Result" : "Chance to win"}
                  </h3>
                  <span className="text-xs font-medium text-slate-600">ESPN</span>
                </div>
                <div className="mb-1 flex justify-between text-sm font-bold">
                  <span style={{ color: awayColor }}>
                    {game.awayTeam} {Math.round(100 - homePct)}%
                  </span>
                  <span style={{ color: homeColor }}>
                    {Math.round(homePct)}% {game.homeTeam}
                  </span>
                </div>
                <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="transition-all duration-700" style={{ width: `${100 - homePct}%`, background: awayColor }} />
                  <div className="transition-all duration-700" style={{ width: `${homePct}%`, background: homeColor }} />
                </div>

                {history.length > 1 && (
                  <WinChart
                    history={history}
                    homeTeam={game.homeTeam}
                    awayTeam={game.awayTeam}
                    homeColor={homeColor}
                    awayColor={awayColor}
                  />
                )}
              </div>
            )}

            {state !== "pre" && homePct === null && !summary && (
              <p className="mt-5 text-center text-sm text-slate-600">Loading game details...</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function StatusChip({ state, live }: { state: string; live?: LiveGame }) {
  if (state === "in") {
    return (
      <span className="flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-sm font-bold text-rose-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
        LIVE · {live ? `${periodLabel(live.period)} ${live.clock ?? ""}`.trim() : "In progress"}
      </span>
    );
  }
  if (state === "post") {
    return (
      <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-bold text-slate-800">
        {live?.detail?.toUpperCase() || "FINAL"}
      </span>
    );
  }
  return <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">UPCOMING</span>;
}

function TeamRow({
  abbr,
  logo,
  score,
  showScore,
  hasBall,
  leading,
  home = false,
}: {
  abbr: string;
  logo?: string | null;
  score: number | null;
  showScore: boolean;
  hasBall: boolean;
  leading: boolean;
  home?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
      <div className="flex items-center gap-3">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-9 w-9 object-contain" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-slate-100" />
        )}
        <div>
          <div className="text-lg font-extrabold text-slate-900">
            {abbr} {hasBall && <span title="Has the ball">🏈</span>}
          </div>
          <div className="text-xs font-medium text-slate-600">{home ? "Home" : "Away"}</div>
        </div>
      </div>
      {showScore && (
        <div className={`text-3xl font-extrabold tabular-nums ${leading ? "text-slate-900" : "text-slate-500"}`}>
          {score ?? "–"}
        </div>
      )}
    </div>
  );
}

// Line chart of the home team's chance to win across the game
function WinChart({
  history,
  homeTeam,
  awayTeam,
  homeColor,
  awayColor,
}: {
  history: number[];
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
}) {
  const W = 320;
  const H = 120;
  const x = (i: number) => (i / (history.length - 1)) * W;
  const y = (pct: number) => H - (pct / 100) * H;
  const line = history.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 p-3">
      <div className="mb-1 flex justify-between text-[11px] font-bold">
        <span style={{ color: homeColor }}>{homeTeam} wins</span>
        <span className="text-slate-600">Win % over the game</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label="Win probability chart">
        <defs>
          <clipPath id="above">
            <rect x="0" y="0" width={W} height={H / 2} />
          </clipPath>
          <clipPath id="below">
            <rect x="0" y={H / 2} width={W} height={H / 2} />
          </clipPath>
        </defs>
        {/* Shade toward whichever team is favored */}
        <path d={`${line} L${W},${H / 2} L0,${H / 2} Z`} fill={homeColor} opacity="0.15" clipPath="url(#above)" />
        <path d={`${line} L${W},${H / 2} L0,${H / 2} Z`} fill={awayColor} opacity="0.15" clipPath="url(#below)" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1" />
        <path d={line} fill="none" stroke="#0f172a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] font-bold">
        <span style={{ color: awayColor }}>{awayTeam} wins</span>
        <span className="text-slate-600">Kickoff → now</span>
      </div>
    </div>
  );
}

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " MT";
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "Starting now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}
