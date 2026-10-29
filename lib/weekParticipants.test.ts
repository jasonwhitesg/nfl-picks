import { describe, expect, it } from "vitest";
import { weekParticipantProfiles } from "./weekParticipants";

describe("weekly player roster", () => {
  const profiles = ["viewer", "one-hidden-pick", "other-week-only", "no-picks"]
    .map(user_id => ({ user_id, username: user_id }));
  it("shows everyone with at least one pick even if their selections are hidden", () => {
    expect(weekParticipantProfiles(profiles, ["viewer", "one-hidden-pick"]).map(p => p.user_id))
      .toEqual(["viewer", "one-hidden-pick"]);
  });
  it("does not carry over players from another week or duplicate rows", () => {
    expect(weekParticipantProfiles(profiles, ["one-hidden-pick", "one-hidden-pick"]))
      .toEqual([profiles[1]]);
    expect(weekParticipantProfiles(profiles, [])).toEqual([]);
  });
});
