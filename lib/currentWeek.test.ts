import { describe, expect, it } from "vitest";
import { pickCurrentWeek } from "./currentWeek";

const hour = 60 * 60 * 1000;
const mondayKickoff = Date.parse("2026-11-03T01:15:00Z");
const games = [
  { week: 9, start_time: "2026-11-01T18:00:00Z", status: "Final" },
  { week: 9, start_time: "2026-11-03T01:15:00Z", status: "InProgress" },
  { week: 10, start_time: "2026-11-06T01:15:00Z", status: "Scheduled" },
];

describe("pickCurrentWeek", () => {
  it("keeps the week while the Monday night game is being played", () => {
    expect(pickCurrentWeek(games, mondayKickoff + 2 * hour)).toBe(9);
  });

  it("keeps the week when the Monday game has not had its status updated", () => {
    const stale = games.map(g => g.week === 9 ? { ...g, status: "Scheduled" } : g);
    expect(pickCurrentWeek(stale, mondayKickoff + 3 * hour)).toBe(9);
  });

  it("moves on once the Monday night game is final", () => {
    const done = games.map(g => ({ ...g, status: g.week === 9 ? "Final" : g.status }));
    expect(pickCurrentWeek(done, mondayKickoff + 4 * hour)).toBe(10);
  });

  it("moves on if a stale status never turns final", () => {
    expect(pickCurrentWeek(games, mondayKickoff + 13 * hour)).toBe(10);
  });

  it("stays on the last week after the season ends", () => {
    const done = games.map(g => ({ ...g, status: "Final" }));
    expect(pickCurrentWeek(done, mondayKickoff + 30 * 24 * hour)).toBe(10);
  });
});
