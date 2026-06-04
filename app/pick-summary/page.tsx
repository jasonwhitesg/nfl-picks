"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type Game = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  week: number;
  winner?: string | null;
  status?: string | null;
};

type Pick = {
  user_id: string;
  game_id: string;
  selected_team: string;
  lock_time: string;
  total_points?: number | null;
};

type Profile = {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  is_admin?: boolean;
};

type PickemGroup = {
  id: string;
  name: string;
  invite_code: string;
  owner_user_id: string;
  season_year: number;
  is_active: boolean;
};

type GamePickStats = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homePicks: number;
  awayPicks: number;
  homePercentage: number;
  awayPercentage: number;
  totalPicks: number;
  winner?: string | null;
  status?: string | null;
};

export default function PickPercentagesPage() {
  const router = useRouter();

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [seasonYear, setSeasonYear] = useState(2026);
  const [myGroups, setMyGroups] = useState<PickemGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupUserIds, setGroupUserIds] = useState<string[]>([]);

  const [gameStats, setGameStats] = useState<GamePickStats[]>([]);
  const [sortBy, setSortBy] = useState<"percentage" | "popularity" | "team">(
    "percentage"
  );

  useEffect(() => {
    loadPage();
  }, []);

  useEffect(() => {
    if (selectedGroupId) {
      fetchApprovedGroupMembers(selectedGroupId);
    }
  }, [selectedGroupId]);

  useEffect(() => {
    if (games.length > 0 && activeWeek && groupUserIds.length > 0) {
      calculatePickPercentages();
    }
  }, [games, picks, activeWeek, groupUserIds]);

  const navItems = [
    { href: "/", label: "Home", icon: "🏠" },
    { href: "/make-picks", label: "Make Picks", icon: "🏈" },
    { href: "/all-picks", label: "View All Picks", icon: "📊" },
    { href: "/pick-summary", label: "Pick Percentages", icon: "📈" },
    { href: "/standings", label: "Standings", icon: "🏆" },
    { href: "/pickem-groups", label: "Pick'em Groups", icon: "👥" },
    { href: "/rules", label: "Rules", icon: "📋" },
    { href: "/profile", label: "Profile", icon: "👤" },
  ];

  const loadPage = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setCurrentUserId(user.id);
      setUserEmail(user.email || null);

      const { data: config } = await supabase
        .from("season_config")
        .select("season_year")
        .single();

      const activeSeason = config?.season_year ?? 2026;
      setSeasonYear(activeSeason);

      await fetchUserProfile(user.id);
      await fetchGroups(user.id, activeSeason);
      await fetchGamesAndPicks(activeSeason);
    } catch (err) {
      console.error("Error loading pick summary:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("user_id", userId)
      .single();

    setIsAdmin(data?.is_admin || false);
  };

  const fetchGroups = async (userId: string, activeSeason: number) => {
    const { data, error } = await supabase
      .from("group_members")
      .select(`
        group_id,
        status,
        groups (
          id,
          name,
          invite_code,
          owner_user_id,
          season_year,
          is_active
        )
      `)
      .eq("user_id", userId)
      .eq("status", "approved");

    if (error) throw error;

    const groups =
      data
        ?.map((row: any) => row.groups)
        .filter(
          (group: PickemGroup | null) =>
            group &&
            group.is_active &&
            group.season_year === activeSeason
        ) || [];

    setMyGroups(groups);

    if (groups.length > 0) {
      setSelectedGroupId(groups[0].id);
    }
  };

  const fetchApprovedGroupMembers = async (groupId: string) => {
    const { data, error } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("status", "approved");

    if (error) {
      console.error("Error fetching group members:", error);
      setGroupUserIds([]);
      return;
    }

    const ids = [...new Set((data || []).map((member) => member.user_id))];
    setGroupUserIds(ids);
  };

  const fetchGamesAndPicks = async (activeSeason: number) => {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("user_id, username, first_name, last_name, email, is_admin");

    setProfiles(profileData || []);

    const { data: gameData } = await supabase
      .from("games")
      .select("*")
      .eq("season", activeSeason);

    const filteredGameData = (gameData || []).filter(
      (g: any) =>
        g.team_a &&
        g.team_b &&
        g.team_a.trim() !== "" &&
        g.team_b.trim() !== "" &&
        g.team_a.toLowerCase() !== "bye" &&
        g.team_b.toLowerCase() !== "bye"
    );

    const mappedGames: Game[] = filteredGameData.map((g: any) => ({
      id: g.id,
      week: g.week,
      startTime: g.start_time,
      homeTeam: g.team_a,
      awayTeam: g.team_b,
      winner: g.winner,
      status: g.status,
    }));

    const sortedGames = mappedGames.sort(
      (a, b) =>
        new Date(a.startTime).getTime() -
        new Date(b.startTime).getTime()
    );

    setGames(sortedGames);

    const { data: pickData, error: pickError } = await supabase
      .from("game_picks")
      .select(`
        *,
        games!inner(id, season, week)
      `)
      .eq("games.season", activeSeason);

    if (pickError) {
      console.error("Error fetching picks:", pickError);
    }

    setPicks(pickData || []);

    const weekNumbers = Array.from(
      new Set(sortedGames.map((game) => game.week))
    ).sort((a, b) => a - b);

    const now = new Date();
    let selectedWeek = weekNumbers[0] || 1;

    for (const week of weekNumbers) {
      const weekGames = sortedGames.filter((game) => game.week === week);

      const hasUpcomingOrLive = weekGames.some((game) => {
        const gameTime = new Date(game.startTime);
        return gameTime > now || game.status !== "Final";
      });

      if (hasUpcomingOrLive) {
        selectedWeek = week;
        break;
      }
    }

    setActiveWeek(selectedWeek);
  };

  const calculatePickPercentages = () => {
    if (!activeWeek) return;

    const weekGames = games.filter((game) => game.week === activeWeek);

    const stats: GamePickStats[] = weekGames.map((game) => {
      const groupGamePicks = picks.filter(
        (pick) =>
          pick.game_id === game.id &&
          groupUserIds.includes(pick.user_id)
      );

      const totalPicks = groupGamePicks.length;

      const homePicks = groupGamePicks.filter(
        (pick) => pick.selected_team === game.homeTeam
      ).length;

      const awayPicks = groupGamePicks.filter(
        (pick) => pick.selected_team === game.awayTeam
      ).length;

      return {
        gameId: game.id,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homePicks,
        awayPicks,
        homePercentage:
          totalPicks > 0 ? Math.round((homePicks / totalPicks) * 100) : 0,
        awayPercentage:
          totalPicks > 0 ? Math.round((awayPicks / totalPicks) * 100) : 0,
        totalPicks,
        winner: game.winner,
        status: game.status,
      };
    });

    setGameStats(stats);
  };

  const handleWeekSelect = (week: number) => {
    setActiveWeek(week);
  };

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getSortedGameStats = () => {
    return [...gameStats].sort((a, b) => {
      if (sortBy === "percentage") {
        const aMax = Math.max(a.homePercentage, a.awayPercentage);
        const bMax = Math.max(b.homePercentage, b.awayPercentage);
        return bMax - aMax;
      }

      if (sortBy === "popularity") {
        return b.totalPicks - a.totalPicks;
      }

      return a.homeTeam.localeCompare(b.homeTeam);
    });
  };

  const getDisplayName = (userId: string) => {
    const profile = profiles.find((p) => p.user_id === userId);

    if (!profile) return userId;

    if (profile.first_name || profile.last_name) {
      return `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
    }

    return profile.username || profile.email;
  };

  const gamesByWeek: Record<number, Game[]> = {};
  games.forEach((game) => {
    if (!gamesByWeek[game.week]) gamesByWeek[game.week] = [];
    gamesByWeek[game.week].push(game);
  });

  const selectedGroup = myGroups.find((group) => group.id === selectedGroupId);

  const totalGroupPicksThisWeek = picks.filter(
    (pick) =>
      groupUserIds.includes(pick.user_id) &&
      games.some(
        (game) => game.id === pick.game_id && game.week === activeWeek
      )
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl text-gray-700">Loading pick percentages...</p>
      </div>
    );
  }

  if (myGroups.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <main className="p-6 max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-4">Pick Percentages</h1>
          <p className="text-gray-600 mb-6">
            You are not approved in any pick'em groups yet.
          </p>
          <button
            onClick={() => router.push("/pickem-groups")}
            className="bg-blue-600 text-white px-5 py-3 rounded-lg font-semibold"
          >
            Go to Pick'em Groups
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-2xl font-bold text-gray-800">Pick Percentages</h1>

          <div className="flex items-center gap-4">
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-gray-700">
                {userEmail}
              </p>
              <p className="text-xs text-gray-500">
                {isAdmin ? "Admin" : "User"} · Season {seasonYear}
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="bg-red-500 text-white px-3 py-2 rounded text-sm font-medium hover:bg-red-600"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 flex gap-2 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${
                item.href === "/pick-summary"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="p-6 max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold text-gray-800 mb-3">
            Pick Percentages
          </h2>
          <p className="text-gray-600 text-lg">
            Showing picks only from approved members in your selected group.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Group
              </label>
              <select
                value={selectedGroupId}
                onChange={(e) => handleGroupSelect(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3"
              >
                {myGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {groupUserIds.length}
              </div>
              <div className="text-sm text-blue-800">Approved Members</div>
            </div>

            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {totalGroupPicksThisWeek}
              </div>
              <div className="text-sm text-green-800">
                Group Picks This Week
              </div>
            </div>
          </div>

          {selectedGroup && (
            <div className="mt-4 text-sm text-gray-600">
              Selected group:{" "}
              <span className="font-semibold text-gray-800">
                {selectedGroup.name}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto">
          {Object.keys(gamesByWeek).map((week) => {
            const weekNum = Number(week);

            return (
              <button
                key={week}
                onClick={() => handleWeekSelect(weekNum)}
                className={`px-4 py-2 rounded font-semibold min-w-[100px] ${
                  activeWeek === weekNum
                    ? "bg-blue-600 text-white border-2 border-blue-700"
                    : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
                }`}
              >
                Week {week}
              </button>
            );
          })}
        </div>

        <div className="flex gap-4 mb-6 flex-wrap">
          <button
            onClick={() => setSortBy("percentage")}
            className={`px-4 py-2 rounded font-semibold ${
              sortBy === "percentage"
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            Sort by Percentage
          </button>

          <button
            onClick={() => setSortBy("popularity")}
            className={`px-4 py-2 rounded font-semibold ${
              sortBy === "popularity"
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            Sort by Popularity
          </button>

          <button
            onClick={() => setSortBy("team")}
            className={`px-4 py-2 rounded font-semibold ${
              sortBy === "team"
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            Sort by Team
          </button>
        </div>

        <div className="grid gap-6">
          {getSortedGameStats().map((game) => (
            <div
              key={game.gameId}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
            >
              <div className="flex justify-between items-center mb-4 gap-3">
                <h3 className="text-xl font-bold text-gray-800">
                  {game.awayTeam} @ {game.homeTeam}
                </h3>

                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    game.status === "Final"
                      ? "bg-green-100 text-green-800"
                      : game.status === "InProgress"
                      ? "bg-red-100 text-red-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {game.status === "Final"
                    ? "FINAL"
                    : game.status === "InProgress"
                    ? "LIVE"
                    : "UPCOMING"}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="font-semibold text-gray-700 mb-2">
                    {game.awayTeam}
                  </div>
                  <div className="text-3xl font-bold text-blue-600 mb-2">
                    {game.awayPercentage}%
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-blue-500 h-4 rounded-full"
                      style={{ width: `${game.awayPercentage}%` }}
                    />
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    {game.awayPicks} of {game.totalPicks} group picks
                  </div>
                </div>

                <div className="text-center">
                  <div className="font-semibold text-gray-700 mb-2">
                    {game.homeTeam}
                  </div>
                  <div className="text-3xl font-bold text-red-600 mb-2">
                    {game.homePercentage}%
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-red-500 h-4 rounded-full"
                      style={{ width: `${game.homePercentage}%` }}
                    />
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    {game.homePicks} of {game.totalPicks} group picks
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 text-center text-sm text-gray-600">
                Total group players voted:{" "}
                <span className="font-semibold text-gray-800">
                  {game.totalPicks}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-xl font-bold text-gray-800 mb-3">
            Group Members Counted
          </h3>

          <div className="flex flex-wrap gap-2">
            {groupUserIds.map((id) => (
              <span
                key={id}
                className="bg-gray-100 text-gray-800 px-3 py-2 rounded-lg text-sm"
              >
                {getDisplayName(id)}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}