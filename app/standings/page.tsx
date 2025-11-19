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
  home_score?: number | null;
  away_score?: number | null;
  winner?: string | null;
  status?: string | null;
  is_monday_night?: boolean;
  actual_total_points?: number | null;
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

type UserStanding = {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  correctPicks: number;
  incorrectPicks: number;
  totalCompletedGames: number;
  percentage: number;
  currentStreak: number;
  bestStreak: number;
  weeklyWins: number;
  totalWinnings: number;
};

export default function StandingsPage() {
  const router = useRouter();
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userStandings, setUserStandings] = useState<UserStanding[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation items
  const navItems = [
    { href: "/", label: "Home", icon: "🏠" },
    { href: "/make-picks", label: "Make Picks", icon: "🏈" },
    { href: "/all-picks", label: "View All Picks", icon: "📊" },
    { href: "/pick-summary", label: "Pick Percentages", icon: "📈" },
    { href: "/standings", label: "Standings", icon: "🏆" },
    { href: "/rules", label: "Rules", icon: "📋" },
    { href: "/profile", label: "Profile", icon: "👤" },
  ];

  // Get current time in MST
  function getNowMST(): Date {
    return new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Denver" })
    );
  }

  useEffect(() => {
    fetchUserData();
    fetchAllData();
  }, []);

  useEffect(() => {
    if (games.length > 0 && picks.length > 0 && profiles.length > 0) {
      calculateStandings();
    }
  }, [games, picks, profiles]);

  const fetchUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || null);
        
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("user_id", user.id)
          .single();
        
        setIsAdmin(profile?.is_admin || false);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);

      // Fetch profiles
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, username, first_name, last_name, email, is_admin")
        .order('username');

      if (profileError) throw profileError;
      setProfiles(profileData || []);

      // Fetch games
      const { data: gameData, error: gameError } = await supabase
        .from("games")
        .select("*")
        .order('week')
        .order('start_time');

      if (gameError) throw gameError;
      
      const filteredGameData = (gameData || []).filter((g: any) => 
        g.team_a && g.team_b && 
        g.team_a.trim() !== '' && g.team_b.trim() !== '' &&
        g.team_a.toLowerCase() !== 'bye' && g.team_b.toLowerCase() !== 'bye'
      );

      const mappedGames: Game[] = filteredGameData.map((g: any) => {
        const utcDate = new Date(g.start_time);
        const mstDate = new Date(utcDate.getTime() - 7 * 60 * 60 * 1000);

        return {
          id: g.id,
          week: g.week,
          startTime: mstDate.toISOString(),
          homeTeam: g.team_a,
          awayTeam: g.team_b,
          home_score: g.home_score,
          away_score: g.away_score,
          winner: g.winner,
          status: g.status,
          is_monday_night: g.is_monday_night,
          actual_total_points: g.actual_total_points,
        };
      });

      setGames(mappedGames);

      // Fetch picks
      const { data: pickData, error: pickError } = await supabase
        .from("game_picks")
        .select("*")
        .order('created_at');

      if (pickError) throw pickError;
      setPicks(pickData || []);
      
      setLoading(false);
    } catch (err) {
      console.error("Error loading data:", err);
      setLoading(false);
    }
  };

  // Calculate standings correctly - ONLY count completed games
  const calculateStandings = async () => {
    const standings: UserStanding[] = [];
    const completedGames = games.filter(game => game.status === 'Final');

    // Fetch weekly winners for winnings calculation
    const { data: weeklyWinners } = await supabase
      .from('weekly_winners')
      .select('*')
      .eq('season', 2025);

    profiles.forEach(profile => {
      const userPicks = picks.filter(pick => pick.user_id === profile.user_id);
      
      let correctPicks = 0;
      let totalCompletedGamesPicked = 0;

      completedGames.forEach(game => {
        const userPick = userPicks.find(p => p.game_id === game.id);
        if (userPick && game.winner) {
          totalCompletedGamesPicked++;
          if (userPick.selected_team === game.winner) {
            correctPicks++;
          }
        }
      });

      const incorrectPicks = totalCompletedGamesPicked - correctPicks;
      const percentage = totalCompletedGamesPicked > 0 
        ? Number(((correctPicks / totalCompletedGamesPicked) * 100).toFixed(1))
        : 0;

      // Calculate streaks (only for completed games)
      let currentStreak = 0;
      let bestStreak = 0;
      let tempStreak = 0;

      // Sort completed games by start time to calculate streaks chronologically
      const userCompletedGames = completedGames
        .filter(game => {
          const userPick = userPicks.find(p => p.game_id === game.id);
          return userPick && game.winner;
        })
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      userCompletedGames.forEach(game => {
        const userPick = userPicks.find(p => p.game_id === game.id);
        if (userPick && game.winner) {
          if (userPick.selected_team === game.winner) {
            tempStreak++;
            currentStreak = tempStreak;
            if (tempStreak > bestStreak) {
              bestStreak = tempStreak;
            }
          } else {
            tempStreak = 0;
            currentStreak = 0;
          }
        }
      });

      // Count weekly wins and winnings from weekly_winners table
      const userWeeklyWins = weeklyWinners?.filter(winner => 
        winner.player_name === profile.username && winner.is_paid_winner
      ).length || 0;

      const totalWinnings = userWeeklyWins * 25; // $25 per win

      standings.push({
        user_id: profile.user_id,
        username: profile.username,
        first_name: profile.first_name,
        last_name: profile.last_name,
        correctPicks,
        incorrectPicks,
        totalCompletedGames: totalCompletedGamesPicked,
        percentage,
        currentStreak: currentStreak > 0 ? currentStreak : 0,
        bestStreak,
        weeklyWins: userWeeklyWins,
        totalWinnings
      });
    });

    // Sort by correct picks first, then percentage
    const sortedStandings = standings.sort((a, b) => {
      if (b.correctPicks !== a.correctPicks) {
        return b.correctPicks - a.correctPicks;
      }
      return b.percentage - a.percentage;
    });

    setUserStandings(sortedStandings);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🏆</div>
          <p className="text-xl text-gray-600">Loading standings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Expandable Header Bar */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setHeaderExpanded(!headerExpanded)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2"
              title={headerExpanded ? "Collapse menu" : "Expand menu"}
            >
              <span className="text-xl">{headerExpanded ? "✕" : "☰"}</span>
              <span className="font-semibold text-gray-800 hidden sm:block">
                {headerExpanded ? "Close Menu" : "Menu"}
              </span>
            </button>
            <h1 className="text-2xl font-bold text-gray-800">NFL Picks</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                {userEmail?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-gray-700">
                  {userEmail || "User"}
                </p>
                <p className="text-xs text-gray-500">
                  {isAdmin ? 'Admin' : 'User'}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="bg-red-500 text-white px-3 py-2 rounded text-sm font-medium hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {headerExpanded && (
          <div className="absolute top-full left-0 w-80 bg-white border-b border-r border-gray-200 shadow-lg z-40">
            <div className="p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Navigation</h2>
                <p className="text-sm text-gray-600">Quick access to all features</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 group border border-gray-200 hover:border-blue-200"
                    onClick={() => setHeaderExpanded(false)}
                  >
                    <span className="text-2xl group-hover:scale-110 transition-transform">
                      {item.icon}
                    </span>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-800 group-hover:text-blue-800">
                        {item.label}
                      </div>
                      <div className="text-xs text-gray-500 group-hover:text-blue-600 mt-1">
                        Click to navigate
                      </div>
                    </div>
                    <span className="text-gray-400 group-hover:text-blue-500 transition-colors">
                      →
                    </span>
                  </a>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-800 mb-3">Quick Stats</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-blue-600">
                      {games.filter(g => g.status === 'Final').length}
                    </div>
                    <div className="text-xs text-blue-800">Games</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-green-600">
                      {profiles.length}
                    </div>
                    <div className="text-xs text-green-800">Players</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-purple-600">
                      {Math.max(...games.map(g => g.week))}
                    </div>
                    <div className="text-xs text-purple-800">Week</div>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-600">🔧</span>
                    <span className="text-sm font-semibold text-yellow-800">Admin Mode Active</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-4xl mx-auto">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Season Standings
          </h1>
          <p className="text-lg text-gray-600">
            Track player rankings and season performance
          </p>
        </div>

        {/* Standings Grid */}
        <div className="grid gap-6">
          {userStandings.map((standing, index) => (
            <div key={standing.user_id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                    index === 0 ? 'bg-yellow-500' :
                    index === 1 ? 'bg-gray-400' :
                    index === 2 ? 'bg-orange-500' :
                    'bg-blue-500'
                  }`}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      {standing.first_name} {standing.last_name}
                    </h3>
                    <p className="text-gray-600">@{standing.username}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-800">
                    {standing.correctPicks}-{standing.incorrectPicks}
                  </div>
                  <div className="text-lg font-semibold text-green-600">
                    {standing.percentage}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-1">Current Streak</div>
                  <div className="text-xl font-bold text-orange-600">
                    {standing.currentStreak} {standing.currentStreak > 0 ? '🔥' : ''}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-1">Best Streak</div>
                  <div className="text-xl font-bold text-purple-600">
                    {standing.bestStreak}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-1">Weekly Wins</div>
                  <div className="text-xl font-bold text-blue-600">
                    {standing.weeklyWins}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600 mb-1">Total Winnings</div>
                  <div className="text-xl font-bold text-green-600">
                    ${standing.totalWinnings}
                  </div>
                </div>
              </div>

              {/* Progress bar for win percentage */}
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Win Percentage</span>
                  <span>{standing.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-green-500 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${standing.percentage}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {profiles.length}
            </div>
            <div className="text-sm text-gray-600">Total Players</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {userStandings.reduce((sum, standing) => sum + standing.correctPicks, 0)}
            </div>
            <div className="text-sm text-gray-600">Total Correct Picks</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {games.filter(g => g.status === 'Final').length}
            </div>
            <div className="text-sm text-gray-600">Completed Games</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">
              ${userStandings.reduce((sum, standing) => sum + standing.totalWinnings, 0)}
            </div>
            <div className="text-sm text-gray-600">Total Winnings</div>
          </div>
        </div>
      </main>
    </div>
  );
}