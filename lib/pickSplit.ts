// How a set of players split their picks on each game (pure logic).

export type SplitGame = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  winner?: string | null;
  status?: string | null;
};

export type SplitPick = { user_id: string; game_id: string; selected_team: string };

export type GameSplit = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homePicks: number;
  awayPicks: number;
  totalPicks: number;
  homePct: number; // whole numbers that always add to 100 when anyone picked
  awayPct: number;
  favorite: string | null; // team most players picked, null on an even split
  favoriteWon: boolean | null; // null until the game is final with a winner
};

// onlyUserIds: limit to these players (a group). Omit to count everyone.
export function computeSplits(games: SplitGame[], picks: SplitPick[], onlyUserIds?: string[]): GameSplit[] {
  const allowed = onlyUserIds ? new Set(onlyUserIds) : null;

  return games.map((game) => {
    const gamePicks = picks.filter((p) => p.game_id === game.id && (!allowed || allowed.has(p.user_id)));
    const homePicks = gamePicks.filter((p) => p.selected_team === game.homeTeam).length;
    const awayPicks = gamePicks.filter((p) => p.selected_team === game.awayTeam).length;
    const totalPicks = homePicks + awayPicks;
    const homePct = totalPicks > 0 ? Math.round((homePicks / totalPicks) * 100) : 0;
    const awayPct = totalPicks > 0 ? 100 - homePct : 0;
    const favorite = homePicks > awayPicks ? game.homeTeam : awayPicks > homePicks ? game.awayTeam : null;
    const decided = game.status === "Final" && !!game.winner;

    return {
      gameId: game.id,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      homePicks,
      awayPicks,
      totalPicks,
      homePct,
      awayPct,
      favorite,
      favoriteWon: decided && favorite ? game.winner === favorite : null,
    };
  });
}

export type SplitSort = "time" | "lopsided" | "closest";

export function sortSplits(splits: GameSplit[], sort: SplitSort): GameSplit[] {
  if (sort === "time") return splits;
  const lean = (s: GameSplit) => Math.abs(s.homePct - s.awayPct);
  return [...splits].sort((a, b) => (sort === "lopsided" ? lean(b) - lean(a) : lean(a) - lean(b)));
}
