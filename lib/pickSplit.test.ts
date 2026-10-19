import { describe, expect, it } from "vitest";
import { computeSplits, sortSplits } from "./pickSplit";

const game = { id: "g1", homeTeam: "KC", awayTeam: "LAC", status: "Scheduled", winner: null };
const picks = [
  { user_id: "a", game_id: "g1", selected_team: "KC" },
  { user_id: "b", game_id: "g1", selected_team: "KC" },
  { user_id: "c", game_id: "g1", selected_team: "LAC" },
  { user_id: "a", game_id: "g2", selected_team: "BUF" },
];

describe("computeSplits", () => {
  it("counts each side and the percentages add to 100", () => {
    const [s] = computeSplits([game], picks);
    expect(s).toMatchObject({ homePicks: 2, awayPicks: 1, totalPicks: 3, homePct: 67, awayPct: 33, favorite: "KC" });
  });

  it("only counts players in the group when a group is given", () => {
    const [s] = computeSplits([game], picks, ["c"]);
    expect(s).toMatchObject({ homePicks: 0, awayPicks: 1, homePct: 0, awayPct: 100, favorite: "LAC" });
  });

  it("shows 0% both ways when nobody picked", () => {
    const [s] = computeSplits([game], []);
    expect(s).toMatchObject({ totalPicks: 0, homePct: 0, awayPct: 0, favorite: null });
  });

  it("has no favorite on an even split", () => {
    const [s] = computeSplits([game], picks.slice(1, 3));
    expect(s.favorite).toBeNull();
  });

  it("says whether the crowd favorite won once the game is final", () => {
    const [won] = computeSplits([{ ...game, status: "Final", winner: "KC" }], picks);
    const [upset] = computeSplits([{ ...game, status: "Final", winner: "LAC" }], picks);
    const [tie] = computeSplits([{ ...game, status: "Final", winner: null }], picks);
    expect(won.favoriteWon).toBe(true);
    expect(upset.favoriteWon).toBe(false);
    expect(tie.favoriteWon).toBeNull();
  });

  it("ignores picks for a team not in the game", () => {
    const [s] = computeSplits([game], [...picks, { user_id: "d", game_id: "g1", selected_team: "DEN" }]);
    expect(s.totalPicks).toBe(3);
  });
});

describe("sortSplits", () => {
  const splits = computeSplits(
    [
      { id: "even", homeTeam: "A", awayTeam: "B" },
      { id: "lopsided", homeTeam: "C", awayTeam: "D" },
    ],
    [
      { user_id: "1", game_id: "even", selected_team: "A" },
      { user_id: "2", game_id: "even", selected_team: "B" },
      { user_id: "1", game_id: "lopsided", selected_team: "C" },
      { user_id: "2", game_id: "lopsided", selected_team: "C" },
    ]
  );

  it("keeps kickoff order by default", () => {
    expect(sortSplits(splits, "time").map((s) => s.gameId)).toEqual(["even", "lopsided"]);
  });

  it("puts the most one-sided games first", () => {
    expect(sortSplits(splits, "lopsided").map((s) => s.gameId)).toEqual(["lopsided", "even"]);
  });

  it("puts the closest splits first", () => {
    expect(sortSplits(splits, "closest").map((s) => s.gameId)).toEqual(["even", "lopsided"]);
  });
});
