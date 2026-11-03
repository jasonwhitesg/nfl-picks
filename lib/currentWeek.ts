// A week stays current until its last game (usually Monday night) is final.
// A game that kicked off more than 12 hours ago counts as done even if its
// stored status was never updated, so a stale status cannot hold the app on
// an old week.
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

export type WeekGame = { week: number; start_time: string; status?: string | null };

export function pickCurrentWeek(games: WeekGame[], now = Date.now()): number {
  const weeks = Array.from(new Set(games.map(game => game.week))).sort((a, b) => a - b);
  const isDone = (game: WeekGame) =>
    game.status === "Final" || now - new Date(game.start_time).getTime() > STALE_AFTER_MS;
  return weeks.find(week => games.some(game => game.week === week && !isDone(game)))
    ?? weeks[weeks.length - 1] ?? 1;
}
