"use client";

import { useEffect, useState } from "react";
import type { LiveGame } from "@/lib/espnLive";

// Polls /api/live for one week. Checks every 30 seconds while any game is
// live, every 5 minutes otherwise, and pauses while the tab is hidden.
export function useLiveScores(season: number | null, week: number | null) {
  const [games, setGames] = useState<Record<string, LiveGame>>({});

  useEffect(() => {
    if (!season || !week) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      let anyLive = false;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/live?season=${season}&week=${week}`);
          if (res.ok) {
            const data: { games: LiveGame[] } = await res.json();
            if (cancelled) return;
            const byId: Record<string, LiveGame> = {};
            for (const g of data.games) byId[g.id] = g;
            setGames(byId);
            anyLive = data.games.some((g) => g.state === "in");
          }
        } catch {
          // Network hiccup: keep the last scores and try again later
        }
      }
      if (!cancelled) timer = setTimeout(load, anyLive ? 30_000 : 300_000);
    };

    // Refresh right away when the player comes back to the app
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        load();
      }
    };

    setGames({});
    load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [season, week]);

  return games;
}
