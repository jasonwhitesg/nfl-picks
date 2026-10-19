import { describe, expect, it } from "vitest";
import { normalizeTeam, parseScoreboard, parseSummary, periodLabel } from "./espnLive";

// Trimmed copies of real ESPN responses (week 6, 2026)
const liveEvent = {
  id: "401873007",
  date: "2026-10-18T20:25Z",
  status: { displayClock: "0:46", period: 2, type: { state: "in", shortDetail: "0:46 - 2nd" } },
  competitions: [
    {
      competitors: [
        { homeAway: "home", score: "10", team: { id: "9", abbreviation: "GB", color: "204e32", logo: "gb.png" } },
        { homeAway: "away", score: "0", team: { id: "6", abbreviation: "DAL", color: "002a5c", logo: "dal.png" } },
      ],
      situation: {
        possession: "6",
        downDistanceText: "2nd & 6 at DAL 23",
        isRedZone: false,
        lastPlay: { text: "Timeout #2 by DAL at 00:46.", probability: { homeWinPercentage: 0.862 } },
      },
    },
  ],
};

const preEvent = {
  id: "401873008",
  date: "2026-10-20T00:15Z",
  status: { displayClock: "0:00", period: 0, type: { state: "pre", shortDetail: "10/19 - 8:15 PM EDT" } },
  competitions: [
    {
      competitors: [
        { homeAway: "home", score: "", team: { id: "25", abbreviation: "SF" } },
        { homeAway: "away", score: "", team: { id: "28", abbreviation: "WSH" } },
      ],
    },
  ],
};

const finalEvent = {
  id: "401873002",
  date: "2026-10-18T17:00Z",
  status: { displayClock: "0:00", period: 5, type: { state: "post", shortDetail: "Final/OT" } },
  competitions: [
    {
      competitors: [
        { homeAway: "home", score: "19", team: { id: "27", abbreviation: "TB" } },
        { homeAway: "away", score: "26", team: { id: "23", abbreviation: "PIT" } },
      ],
      situation: { lastPlay: { probability: { homeWinPercentage: 0 } } },
    },
  ],
};

describe("parseScoreboard", () => {
  it("reads a live game: score, clock, situation and win %", () => {
    const [game] = parseScoreboard({ events: [liveEvent] });
    expect(game).toMatchObject({
      id: "401873007",
      state: "in",
      detail: "0:46 - 2nd",
      clock: "0:46",
      period: 2,
      home: { abbr: "GB", score: 10, color: "204e32" },
      away: { abbr: "DAL", score: 0 },
      homeWinPct: 86.2,
      downDistance: "2nd & 6 at DAL 23",
      possession: "DAL",
      isRedZone: false,
      lastPlay: "Timeout #2 by DAL at 00:46.",
    });
  });

  it("reads a game that has not started: no scores, clock or win %", () => {
    const [game] = parseScoreboard({ events: [preEvent] });
    expect(game.state).toBe("pre");
    expect(game.home.score).toBeNull();
    expect(game.away.score).toBeNull();
    expect(game.clock).toBeNull();
    expect(game.homeWinPct).toBeNull();
    expect(game.possession).toBeNull();
  });

  it("maps ESPN's WSH to WAS so it matches the games table", () => {
    const [game] = parseScoreboard({ events: [preEvent] });
    expect(game.away.abbr).toBe("WAS");
  });

  it("ignores situation data once a game is final", () => {
    const [game] = parseScoreboard({ events: [finalEvent] });
    expect(game.state).toBe("post");
    expect(game.detail).toBe("Final/OT");
    expect(game.homeWinPct).toBeNull();
    expect(game.clock).toBeNull();
  });

  it("skips events missing a home or away team", () => {
    const broken = { ...liveEvent, competitions: [{ competitors: [liveEvent.competitions[0].competitors[0]] }] };
    expect(parseScoreboard({ events: [broken, preEvent] })).toHaveLength(1);
  });

  it("returns an empty list for an empty or bad response", () => {
    expect(parseScoreboard({})).toEqual([]);
    expect(parseScoreboard(null)).toEqual([]);
  });

  it("treats an unknown state as not started", () => {
    const odd = { ...preEvent, status: { ...preEvent.status, type: { state: "delayed", shortDetail: "Delayed" } } };
    expect(parseScoreboard({ events: [odd] })[0].state).toBe("pre");
  });
});

describe("parseSummary", () => {
  it("turns the win probability history into percentages", () => {
    const summary = parseSummary({
      winprobability: [{ homeWinPercentage: 0.4789 }, { homeWinPercentage: 0.4497 }, { homeWinPercentage: 0.862 }],
    });
    expect(summary.homeWinHistory).toEqual([47.9, 45, 86.2]);
    expect(summary.pregameHomeWinPct).toBeNull();
  });

  it("reads the pregame matchup predictor", () => {
    const summary = parseSummary({ predictor: { homeTeam: { gameProjection: "86.3" } } });
    expect(summary.pregameHomeWinPct).toBe(86.3);
    expect(summary.homeWinHistory).toEqual([]);
  });

  it("drops bad points instead of breaking the chart", () => {
    const summary = parseSummary({ winprobability: [{ homeWinPercentage: 0.5 }, {}, { homeWinPercentage: "x" }] });
    expect(summary.homeWinHistory).toEqual([50]);
  });
});

describe("helpers", () => {
  it("labels quarters and overtime", () => {
    expect(periodLabel(0)).toBe("");
    expect(periodLabel(2)).toBe("Q2");
    expect(periodLabel(5)).toBe("OT");
    expect(periodLabel(6)).toBe("2OT");
  });

  it("leaves normal team codes alone", () => {
    expect(normalizeTeam("KC")).toBe("KC");
    expect(normalizeTeam("WSH")).toBe("WAS");
  });
});
