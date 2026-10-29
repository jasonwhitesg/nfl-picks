import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), range: vi.fn(), eq: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));

function request(query = "season=2026&week=8", token = "player-token") {
  return new Request(`https://nfl.example/api/week-participants?${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-test-key");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "viewer" } }, error: null });
  const query = { select: vi.fn().mockReturnThis(), eq: mocks.eq.mockReturnThis(),
    order: vi.fn().mockReturnThis(), range: mocks.range };
  mocks.from.mockReturnValue(query);
  mocks.range.mockResolvedValue({ data: [], error: null });
});

describe("week participation without exposing picks", () => {
  it("includes a player with just one pick and returns IDs only", async () => {
    mocks.range.mockResolvedValue({ data: [
      { user_id: "one-pick", selected_team: "SECRET", total_points: 51 },
      { user_id: "many-picks" }, { user_id: "many-picks" },
    ], error: null });
    const response = await GET(request());
    expect(await response.json()).toEqual({ userIds: ["one-pick", "many-picks"] });
    expect(mocks.eq.mock.calls).toEqual([["games.season", 2026], ["games.week", 8]]);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("does not read picks for a signed-out request", async () => {
    expect((await GET(request(undefined, ""))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not read picks with an invalid token", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it.each(["season=0&week=8", "season=2026&week=0", "season=2026&week=1.5"])(
    "rejects invalid week scope %s", async query => {
      expect((await GET(request(query))).status).toBe(400);
      expect(mocks.from).not.toHaveBeenCalled();
    });
  it("returns an empty list for a week with no picks", async () => {
    expect(await (await GET(request())).json()).toEqual({ userIds: [] });
  });
  it("does not expose database errors", async () => {
    mocks.range.mockResolvedValue({ data: null, error: new Error("secret database detail") });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret database detail");
  });
});
