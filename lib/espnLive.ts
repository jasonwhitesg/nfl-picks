// Turns ESPN's public NFL feeds into the small shapes the app needs.
// Pure functions only (no fetching) so they are easy to test.

export type GameState = "pre" | "in" | "post";

export type LiveTeam = {
  abbr: string;
  score: number | null;
  color: string | null; // hex without '#'
  logo: string | null;
};

export type LiveGame = {
  id: string;
  state: GameState;
  detail: string; // e.g. "0:46 - 2nd", "Final", "Final/OT"
  clock: string | null; // e.g. "0:46" (live only)
  period: number; // 1-4, 5+ = overtime
  startTime: string;
  home: LiveTeam;
  away: LiveTeam;
  homeWinPct: number | null; // 0-100, live games only
  downDistance: string | null; // e.g. "2nd & 6 at DAL 23"
  possession: string | null; // team abbreviation with the ball
  isRedZone: boolean;
  lastPlay: string | null;
};

export type GameSummary = {
  homeWinHistory: number[]; // 0-100, one point per play
  pregameHomeWinPct: number | null; // ESPN matchup predictor, 0-100
};

// ESPN uses WSH; the games table uses WAS
const teamMap: Record<string, string> = { WSH: "WAS" };
export const normalizeTeam = (abbr: string) => teamMap[abbr] ?? abbr;

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toPct = (fraction: unknown): number | null => {
  const n = toNumber(fraction);
  return n === null ? null : Math.round(n * 1000) / 10; // 0.862 -> 86.2
};

export function parseScoreboard(json: any): LiveGame[] {
  const events: any[] = json?.events ?? [];
  const games: LiveGame[] = [];

  for (const event of events) {
    const competition = event?.competitions?.[0];
    const competitors: any[] = competition?.competitors ?? [];
    const homeRaw = competitors.find((c) => c.homeAway === "home");
    const awayRaw = competitors.find((c) => c.homeAway === "away");
    if (!homeRaw || !awayRaw) continue;

    const teamFrom = (c: any): LiveTeam => ({
      abbr: normalizeTeam(c.team?.abbreviation ?? ""),
      score: toNumber(c.score),
      color: c.team?.color ?? null,
      logo: c.team?.logo ?? null,
    });
    const home = teamFrom(homeRaw);
    const away = teamFrom(awayRaw);

    const state: GameState = ["pre", "in", "post"].includes(event?.status?.type?.state)
      ? event.status.type.state
      : "pre";
    const situation = state === "in" ? competition?.situation : null;

    // Possession comes back as a team id; map it to the abbreviation
    const possessionId = situation?.possession ? String(situation.possession) : null;
    const possession =
      possessionId === String(homeRaw.team?.id)
        ? home.abbr
        : possessionId === String(awayRaw.team?.id)
        ? away.abbr
        : null;

    games.push({
      id: String(event.id),
      state,
      detail: event?.status?.type?.shortDetail ?? "",
      clock: state === "in" ? event?.status?.displayClock ?? null : null,
      period: toNumber(event?.status?.period) ?? 0,
      startTime: event?.date ?? "",
      home,
      away,
      homeWinPct: situation ? toPct(situation.lastPlay?.probability?.homeWinPercentage) : null,
      downDistance: situation?.downDistanceText ?? null,
      possession,
      isRedZone: Boolean(situation?.isRedZone),
      lastPlay: situation?.lastPlay?.text ?? null,
    });
  }

  return games;
}

export function parseSummary(json: any): GameSummary {
  const history: any[] = json?.winprobability ?? [];
  return {
    homeWinHistory: history
      .map((p) => toPct(p?.homeWinPercentage))
      .filter((p): p is number => p !== null),
    pregameHomeWinPct: toNumber(json?.predictor?.homeTeam?.gameProjection),
  };
}

// "1st", "2nd", "OT", "2OT" — for labels like "Q2 0:46"
export function periodLabel(period: number): string {
  if (period <= 0) return "";
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}
