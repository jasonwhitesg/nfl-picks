import { describe, expect, it } from "vitest";
import { computeStandings, weeklyPot, winnerShare } from "./standings";

describe("pot helpers", () => {
  it("is $5 per paid player", () => {
    expect(weeklyPot(11)).toBe(55);
    expect(weeklyPot(0)).toBe(0);
  });

  it("splits to the cent and pays nothing with no winners", () => {
    expect(winnerShare(11, 1)).toBe(55);
    expect(winnerShare(11, 2)).toBe(27.5);
    expect(winnerShare(10, 3)).toBe(16.67);
    expect(winnerShare(10, 0)).toBe(0);
  });
});

const games = [
  { id: "g1", startTime: "2026-09-10T00:00Z", status: "Final", winner: "KC" },
  { id: "g2", startTime: "2026-09-11T00:00Z", status: "Final", winner: "BUF" },
  { id: "g3", startTime: "2026-09-12T00:00Z", status: "Final", winner: "DAL" },
  { id: "tie", startTime: "2026-09-13T00:00Z", status: "Final", winner: null },
  { id: "later", startTime: "2026-09-14T00:00Z", status: "Scheduled", winner: null },
];
const players = [
  { user_id: "a", username: "King", first_name: "Randy", last_name: "King" },
  { user_id: "b", username: "Zeusdog" },
  { user_id: "c", username: "NoPicks" },
];
const pick = (user_id: string, game_id: string, selected_team: string) => ({ user_id, game_id, selected_team });

describe("computeStandings", () => {
  const picks = [
    pick("a", "g1", "KC"),
    pick("a", "g2", "MIA"),
    pick("a", "g3", "DAL"),
    pick("a", "tie", "NYG"),
    pick("a", "later", "SF"),
    pick("b", "g1", "KC"),
    pick("b", "g2", "BUF"),
    pick("b", "g3", "PHI"),
  ];

  it("counts right and wrong on decided games only", () => {
    const king = computeStandings(games, picks, players, []).find((r) => r.username === "King");
    expect(king).toMatchObject({ username: "King", correct: 2, wrong: 1, percentage: 66.7, name: "Randy King" });
  });

  it("tracks the current and best streak in kickoff order", () => {
    const rows = computeStandings(games, picks, players, []);
    const zeus = rows.find((r) => r.username === "Zeusdog")!;
    const king = rows.find((r) => r.username === "King")!;
    expect(zeus).toMatchObject({ currentStreak: 0, bestStreak: 2 });
    expect(king).toMatchObject({ currentStreak: 1, bestStreak: 1 });
  });

  it("leaves out players with no decided picks", () => {
    expect(computeStandings(games, picks, players, []).map((r) => r.username)).not.toContain("NoPicks");
  });

  it("pays the whole $5-per-player pot to the paid winner", () => {
    // Week 1: 8 paid players -> $40. Week 2: 11 paid -> $55.
    const winners = [
      { week: 1, player_name: "King", is_paid_winner: true },
      { week: 2, player_name: "King", is_paid_winner: true },
    ];
    const king = computeStandings(games, picks, players, winners, { 1: 8, 2: 11 }).find((r) => r.username === "King")!;
    expect(king).toMatchObject({ weeklyWins: 2, winnings: 95 });
  });

  it("splits the pot evenly between tied paid winners", () => {
    // 11 paid players -> $55 split 3 ways = $18.33 each
    const winners = [
      { week: 6, player_name: "King", is_paid_winner: true },
      { week: 6, player_name: "Zeusdog", is_paid_winner: true },
      { week: 6, player_name: "AlphaDMH", is_paid_winner: true },
    ];
    const king = computeStandings(games, picks, players, winners, { 6: 11 }).find((r) => r.username === "King")!;
    expect(king.winnings).toBe(18.33);
  });

  it("does not pay or count would-have-won rows, and they don't shrink the split", () => {
    const winners = [
      { week: 3, player_name: "King", is_paid_winner: true },
      { week: 3, player_name: "Zeusdog", is_paid_winner: false },
    ];
    const rows = computeStandings(games, picks, players, winners, { 3: 4 });
    expect(rows.find((r) => r.username === "King")).toMatchObject({ weeklyWins: 1, winnings: 20 });
    expect(rows.find((r) => r.username === "Zeusdog")).toMatchObject({ weeklyWins: 0, winnings: 0 });
  });

  it("pays nothing when the week's paid count is unknown", () => {
    const winners = [{ week: 9, player_name: "King", is_paid_winner: true }];
    expect(computeStandings(games, picks, players, winners).find((r) => r.username === "King")!.winnings).toBe(0);
  });

  it("ranks by correct picks, then percentage, then name", () => {
    const tied = [pick("a", "g1", "KC"), pick("b", "g1", "KC"), pick("b", "g2", "MIA")];
    expect(computeStandings(games, tied, players, []).map((r) => r.username)).toEqual(["King", "Zeusdog"]);
    const even = [pick("a", "g1", "KC"), pick("b", "g1", "KC")];
    expect(computeStandings(games, even, players, []).map((r) => r.username)).toEqual(["King", "Zeusdog"]);
  });
});
