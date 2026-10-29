import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchAll } from "../../../lib/fetchAll";

const headers = { "Cache-Control": "private, no-store" };

// Participation is public to signed-in players; selections remain protected by
// game_picks RLS. Never return a pick, prediction or per-game participation here.
export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });

  const params = new URL(request.url).searchParams;
  const season = Number(params.get("season"));
  const week = Number(params.get("week"));
  if (!Number.isInteger(season) || season < 2000 || season > new Date().getUTCFullYear() + 1
      || !Number.isInteger(week) || week < 1 || week > 22) {
    return NextResponse.json({ error: "Invalid season or week" }, { status: 400, headers });
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing server configuration");
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    }

    const rows = await fetchAll<{ user_id: string }>((from, to) => db
      .from("game_picks")
      .select("user_id, games!inner(season, week)")
      .eq("games.season", season)
      .eq("games.week", week)
      .order("id")
      .range(from, to));
    return NextResponse.json({ userIds: [...new Set(rows.map(row => row.user_id))] }, { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load week participants" }, { status: 500, headers });
  }
}
