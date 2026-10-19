import { describe, expect, it } from "vitest";
import { fetchAll } from "./fetchAll";

// Fake table with `total` rows, served in pages like Supabase's .range()
const fakeTable = (total: number) => {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const data = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i);
    return { data, error: null };
  };
  return { page, calls };
};

describe("fetchAll", () => {
  it("keeps paging until a short page comes back", async () => {
    const { page, calls } = fakeTable(2500);
    const rows = await fetchAll(page);
    expect(rows).toHaveLength(2500);
    expect(rows[2499]).toBe(2499);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("asks once more when the last page is exactly full", async () => {
    const { page, calls } = fakeTable(1000);
    expect(await fetchAll(page)).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it("throws the error from Supabase", async () => {
    await expect(fetchAll(async () => ({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
