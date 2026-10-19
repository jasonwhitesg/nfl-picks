// Season standings math (pure logic, no Supabase).

export type StandingGame = { id: string; startTime: string; winner?: string | null; status?: string | null };
export type StandingPick = { user_id: string; game_id: string; selected_team: string };
export type StandingPlayer = { user_id: string; username: string; first_name?: string | null; last_name?: string | null };
export type StandingWinner = { week: number; player_name: string; is_paid_winner: boolean };

export type Standing = {
  user_id: string;
  username: string;
  name: string;
  correct: number;
  wrong: number;
  percentage: number; // one decimal place
  currentStreak: number;
  bestStreak: number;
  weeklyWins: number;
  winnings: number;
};

// $5 per paid player each week. The paid winner takes the whole pot;
// tied paid winners split it evenly.
export const ENTRY_FEE = 5;

export const weeklyPot = (paidPlayers: number) => paidPlayers * ENTRY_FEE;

// What one paid winner earns for a week, rounded to cents
export function winnerShare(paidPlayers: number, paidWinners: number): number {
  if (paidWinners <= 0) return 0;
  return Math.round((weeklyPot(paidPlayers) / paidWinners) * 100) / 100;
}

// Only final games with a winner count (a tie game counts for nobody).
// Players with no picks on any decided game are left out.
export function computeStandings(
  games: StandingGame[],
  picks: StandingPick[],
  players: StandingPlayer[],
  winners: StandingWinner[],
  paidPlayersByWeek: Record<number, number> = {}
): Standing[] {
  // How many paid winners shared each week
  const paidWinnersByWeek: Record<number, number> = {};
  for (const w of winners) {
    if (w.is_paid_winner) paidWinnersByWeek[w.week] = (paidWinnersByWeek[w.week] ?? 0) + 1;
  }

  const decided = games
    .filter((g) => g.status === "Final" && g.winner)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const decidedIds = new Set(decided.map((g) => g.id));

  const picksByUser = new Map<string, Map<string, string>>();
  for (const p of picks) {
    if (!decidedIds.has(p.game_id)) continue;
    if (!picksByUser.has(p.user_id)) picksByUser.set(p.user_id, new Map());
    picksByUser.get(p.user_id)!.set(p.game_id, p.selected_team);
  }

  const standings: Standing[] = [];
  for (const player of players) {
    const mine = picksByUser.get(player.user_id);
    if (!mine || mine.size === 0) continue;

    let correct = 0;
    let wrong = 0;
    let run = 0;
    let best = 0;
    for (const g of decided) {
      const pick = mine.get(g.id);
      if (!pick) continue;
      if (pick === g.winner) {
        correct++;
        run++;
        best = Math.max(best, run);
      } else {
        wrong++;
        run = 0;
      }
    }

    const myWins = winners.filter((w) => w.player_name === player.username && w.is_paid_winner);
    const weeklyWins = myWins.length;
    const winnings =
      Math.round(
        myWins.reduce((sum, w) => sum + winnerShare(paidPlayersByWeek[w.week] ?? 0, paidWinnersByWeek[w.week]), 0) * 100
      ) / 100;
    const total = correct + wrong;

    standings.push({
      user_id: player.user_id,
      username: player.username,
      name: `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(),
      correct,
      wrong,
      percentage: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0,
      currentStreak: run,
      bestStreak: best,
      weeklyWins,
      winnings,
    });
  }

  return standings.sort(
    (a, b) => b.correct - a.correct || b.percentage - a.percentage || a.username.localeCompare(b.username)
  );
}
