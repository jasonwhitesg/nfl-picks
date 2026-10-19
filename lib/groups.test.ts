import { describe, expect, it } from "vitest";
import { inviteCandidates, makeInviteCode, splitMemberships, type GroupInfo } from "./groups";

const group = (id: string, name: string, extra: Partial<GroupInfo> = {}): GroupInfo => ({
  id,
  name,
  invite_code: "ABC123",
  owner_user_id: "owner",
  season_year: 2026,
  is_active: true,
  ...extra,
});

describe("splitMemberships", () => {
  it("puts invites, joined groups and join requests in separate lists", () => {
    const result = splitMemberships(
      [
        { status: "invited", groups: group("1", "Office") },
        { status: "approved", groups: group("2", "Family") },
        { status: "pending", groups: group("3", "Friends") },
      ],
      2026
    );
    expect(result.invites.map((g) => g.name)).toEqual(["Office"]);
    expect(result.joined.map((g) => g.name)).toEqual(["Family"]);
    expect(result.requested.map((g) => g.name)).toEqual(["Friends"]);
  });

  it("hides denied memberships", () => {
    const result = splitMemberships([{ status: "denied", groups: group("1", "Office") }], 2026);
    expect(result).toEqual({ invites: [], joined: [], requested: [] });
  });

  it("ignores other seasons, inactive groups and missing groups", () => {
    const result = splitMemberships(
      [
        { status: "approved", groups: group("1", "Old", { season_year: 2025 }) },
        { status: "approved", groups: group("2", "Closed", { is_active: false }) },
        { status: "approved", groups: null },
      ],
      2026
    );
    expect(result.joined).toEqual([]);
  });

  it("sorts each list by name", () => {
    const result = splitMemberships(
      [
        { status: "approved", groups: group("1", "Zebra") },
        { status: "approved", groups: group("2", "Alpha") },
      ],
      2026
    );
    expect(result.joined.map((g) => g.name)).toEqual(["Alpha", "Zebra"]);
  });
});

describe("inviteCandidates", () => {
  const players = [
    { user_id: "a", username: "King", first_name: "Randy", last_name: "King" },
    { user_id: "b", username: "Zeusdog" },
    { user_id: "c", username: "AlphaDMH" },
    { user_id: "d", username: "Rexroo" },
  ];

  it("leaves out players already invited, pending or in the group", () => {
    const members = [
      { user_id: "a", status: "approved" },
      { user_id: "b", status: "invited" },
      { user_id: "c", status: "pending" },
    ];
    expect(inviteCandidates(players, members).map((p) => p.username)).toEqual(["Rexroo"]);
  });

  it("lets a denied player be invited again", () => {
    const members = [{ user_id: "d", status: "denied" }];
    expect(inviteCandidates(players, members).map((p) => p.user_id)).toContain("d");
  });

  it("searches username and real name, ignoring case", () => {
    expect(inviteCandidates(players, [], "randy").map((p) => p.username)).toEqual(["King"]);
    expect(inviteCandidates(players, [], "ZEUS").map((p) => p.username)).toEqual(["Zeusdog"]);
  });

  it("sorts by username", () => {
    expect(inviteCandidates(players, []).map((p) => p.username)).toEqual(["AlphaDMH", "King", "Rexroo", "Zeusdog"]);
  });
});

describe("makeInviteCode", () => {
  it("makes a 6 character code without look-alike characters", () => {
    const code = makeInviteCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("is predictable with a fixed random source", () => {
    expect(makeInviteCode(() => 0)).toBe("AAAAAA");
    expect(makeInviteCode(() => 0.999, 3)).toBe("999");
  });
});
