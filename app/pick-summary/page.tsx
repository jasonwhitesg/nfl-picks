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

type TeamTrends = {
  team: string;
  totalPicks: number;
  gamesFeatured: number;
  averagePickPercentage: number;
  wins: number;
  losses: number;
};

export default function PickPercentagesPage() {
  const router = useRouter();
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [games, setGames] = useState<Game[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameStats, setGameStats] = useState<GamePickStats[]>([]);
  const [teamTrends, setTeamTrends] = useState<TeamTrends[]>([]);
  const [userSelectedWeek, setUserSelectedWeek] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'percentage' | 'popularity' | 'team'>('percentage');
  const [viewMode, setViewMode] = useState<'games' | 'teams'>('games');

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

  useEffect(() => {
    fetchUserData();
    fetchAllData();
  }, []);

  useEffect(() => {
    if (games.length > 0 && picks.length > 0 && profiles.length > 0) {
      calculatePickPercentages();
      calculateTeamTrends();
    }
  }, [games, picks, profiles, activeWeek]);

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
      const { data: profileData } = await supabase
        .from("profiles")
        .select("user_id, username, first_name, last_name, email, is_admin");
      setProfiles(profileData || []);

      // Fetch games
      const { data: gameData } = await supabase.from("games").select("*");
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

      const sortedGames = mappedGames.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
      setGames(sortedGames);

      // Fetch picks
      const { data: pickData } = await supabase.from("game_picks").select("*");
      setPicks(pickData || []);

      // Auto-select current week
      if (!userSelectedWeek) {
        const weekNumbers = Array.from(new Set(sortedGames.map((g) => g.week))).sort((a, b) => a - b);
        const now = new Date();
        
        let newActiveWeek = activeWeek;
        
        for (let week of weekNumbers) {
          const weekGames = sortedGames.filter(g => g.week === week);
          if (weekGames.length === 0) continue;
          
          const hasActiveGames = weekGames.some(game => {
            const gameTime = new Date(game.startTime);
            return gameTime > now || (gameTime <= now && game.status !== "Final");
          });
          
          const allGamesFinal = weekGames.every(game => game.status === "Final");
          
          if (hasActiveGames) {
            newActiveWeek = week;
            break;
          }
          
          if (allGamesFinal && !newActiveWeek) {
            newActiveWeek = week;
          }
        }
        
        if (newActiveWeek) {
          setActiveWeek(newActiveWeek);
        } else {
          setActiveWeek(weekNumbers[weekNumbers.length - 1] || 1);
        }
      }
      
      setLoading(false);
    } catch (err) {
      console.error("Error loading data:", err);
      setLoading(false);
    }
  };

  const calculatePickPercentages = () => {
    if (!activeWeek) return;

    const weekGames = games.filter(game => game.week === activeWeek);
    const stats: GamePickStats[] = [];

    weekGames.forEach(game => {
      const gamePicks = picks.filter(pick => pick.game_id === game.id);
      const totalPicks = gamePicks.length;
      
      const homePicks = gamePicks.filter(pick => pick.selected_team === game.homeTeam).length;
      const awayPicks = gamePicks.filter(pick => pick.selected_team === game.awayTeam).length;
      
      const homePercentage = totalPicks > 0 ? Math.round((homePicks / totalPicks) * 100) : 0;
      const awayPercentage = totalPicks > 0 ? Math.round((awayPicks / totalPicks) * 100) : 0;

      stats.push({
        gameId: game.id,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homePicks,
        awayPicks,
        homePercentage,
        awayPercentage,
        totalPicks,
        winner: game.winner,
        status: game.status
      });
    });

    setGameStats(stats);
  };

  const calculateTeamTrends = () => {
    const allTeams = new Set<string>();
    games.forEach(game => {
      allTeams.add(game.homeTeam);
      allTeams.add(game.awayTeam);
    });

    const trends: TeamTrends[] = Array.from(allTeams).map(team => {
      // Find games where this team is playing
      const teamGames = games.filter(game => 
        game.homeTeam === team || game.awayTeam === team
      );

      // Calculate picks for this team across all games
      let totalPicksForTeam = 0;
      let totalPossiblePicks = 0;

      teamGames.forEach(game => {
        const gamePicks = picks.filter(pick => pick.game_id === game.id);
        const picksForTeam = gamePicks.filter(pick => pick.selected_team === team).length;
        totalPicksForTeam += picksForTeam;
        totalPossiblePicks += gamePicks.length;
      });

      // Calculate wins and losses
      const wins = teamGames.filter(game => game.winner === team && game.status === "Final").length;
      const losses = teamGames.filter(game => 
        game.status === "Final" && game.winner !== null && game.winner !== team
      ).length;

      const averagePickPercentage = totalPossiblePicks > 0 
        ? Math.round((totalPicksForTeam / totalPossiblePicks) * 100) 
        : 0;

      return {
        team,
        totalPicks: totalPicksForTeam,
        gamesFeatured: teamGames.length,
        averagePickPercentage,
        wins,
        losses
      };
    });

    setTeamTrends(trends);
  };

  const handleWeekSelect = (week: number) => {
    setUserSelectedWeek(true);
    setActiveWeek(week);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getSortedGameStats = () => {
    return [...gameStats].sort((a, b) => {
      if (sortBy === 'percentage') {
        const aMax = Math.max(a.homePercentage, a.awayPercentage);
        const bMax = Math.max(b.homePercentage, b.awayPercentage);
        return bMax - aMax;
      } else if (sortBy === 'popularity') {
        return b.totalPicks - a.totalPicks;
      } else {
        return a.homeTeam.localeCompare(b.homeTeam);
      }
    });
  };

  const getSortedTeamTrends = () => {
    return [...teamTrends].sort((a, b) => {
      if (sortBy === 'percentage') {
        return b.averagePickPercentage - a.averagePickPercentage;
      } else if (sortBy === 'popularity') {
        return b.totalPicks - a.totalPicks;
      } else {
        return a.team.localeCompare(b.team);
      }
    });
  };

  const gamesByWeek: Record<number, Game[]> = {};
  games.forEach((g) => {
    if (!gamesByWeek[g.week]) gamesByWeek[g.week] = [];
    gamesByWeek[g.week].push(g);
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-xl text-gray-600">Loading pick percentages...</p>
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
              className="p-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 bg-gray-100 border border-gray-300"
            >
              <span className="text-xl text-gray-800">{headerExpanded ? "✕" : "☰"}</span>
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
                      {activeWeek ? (gamesByWeek[activeWeek]?.length || 0) : 0}
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
                      {activeWeek || 1}
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
      <main className="p-6 max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Pick Percentages
          </h1>
          <p className="text-lg text-gray-600">
            View voting trends and pick distributions across all players
          </p>
        </div>

        {/* Week Selection */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {Object.keys(gamesByWeek).map((week) => {
            const weekNum = Number(week);
            const isCurrentWeek = activeWeek === weekNum;
            
            return (
              <button
                key={week}
                onClick={() => handleWeekSelect(weekNum)}
                className={`px-4 py-2 rounded font-semibold transition-colors min-w-[100px] ${
                  isCurrentWeek 
                    ? "bg-blue-600 text-white border-2 border-blue-700" 
                    : "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200"
                }`}
              >
                Week {week}
              </button>
            );
          })}
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setViewMode('games')}
            className={`px-4 py-2 rounded font-semibold transition-colors ${
              viewMode === 'games' 
                ? "bg-blue-600 text-white" 
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            📊 Game Breakdown
          </button>
          <button
            onClick={() => setViewMode('teams')}
            className={`px-4 py-2 rounded font-semibold transition-colors ${
              viewMode === 'teams' 
                ? "bg-blue-600 text-white" 
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            🏈 Team Trends
          </button>
        </div>

        {/* Sort Controls */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setSortBy('percentage')}
            className={`px-4 py-2 rounded font-semibold transition-colors ${
              sortBy === 'percentage' 
                ? "bg-green-600 text-white" 
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Sort by Percentage
          </button>
          <button
            onClick={() => setSortBy('popularity')}
            className={`px-4 py-2 rounded font-semibold transition-colors ${
              sortBy === 'popularity' 
                ? "bg-green-600 text-white" 
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Sort by Popularity
          </button>
          <button
            onClick={() => setSortBy('team')}
            className={`px-4 py-2 rounded font-semibold transition-colors ${
              sortBy === 'team' 
                ? "bg-green-600 text-white" 
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Sort by Team
          </button>
        </div>

        {viewMode === 'games' ? (
          /* Game Pick Percentages */
          <div className="grid gap-6">
            {getSortedGameStats().map((game) => (
              <div key={game.gameId} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-800">
                    {game.awayTeam} @ {game.homeTeam}
                  </h3>
                  <div className="flex gap-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      game.status === "Final" 
                        ? "bg-green-100 text-green-800" 
                        : game.status === "InProgress"
                        ? "bg-red-100 text-red-800"
                        : "bg-blue-100 text-blue-800"
                    }`}>
                      {game.status === "Final" ? "FINAL" : game.status === "InProgress" ? "LIVE" : "UPCOMING"}
                    </span>
                    {game.winner && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold">
                        Winner: {game.winner}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Away Team */}
                  <div className="text-center">
                    <div className="font-semibold text-gray-700 mb-2">{game.awayTeam}</div>
                    <div className="text-3xl font-bold text-blue-600 mb-2">
                      {game.awayPercentage}%
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div 
                        className="bg-blue-500 h-4 rounded-full transition-all duration-500"
                        style={{ width: `${game.awayPercentage}%` }}
                      ></div>
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      {game.awayPicks} of {game.totalPicks} picks
                    </div>
                  </div>

                  {/* Home Team */}
                  <div className="text-center">
                    <div className="font-semibold text-gray-700 mb-2">{game.homeTeam}</div>
                    <div className="text-3xl font-bold text-red-600 mb-2">
                      {game.homePercentage}%
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div 
                        className="bg-red-500 h-4 rounded-full transition-all duration-500"
                        style={{ width: `${game.homePercentage}%` }}
                      ></div>
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      {game.homePicks} of {game.totalPicks} picks
                    </div>
                  </div>
                </div>

                {/* Overall Stats */}
                <div className="mt-4 pt-4 border-t border-gray-200 text-center">
                  <div className="text-sm text-gray-600">
                    Total players voted: <span className="font-semibold text-gray-800">{game.totalPicks}</span>
                  </div>
                  {game.totalPicks > 0 && (
                    <div className="text-sm text-gray-600 mt-1">
                      Most popular pick: <span className="font-semibold text-gray-800">
                        {game.homePercentage > game.awayPercentage ? game.homeTeam : game.awayTeam}
                      </span> ({Math.max(game.homePercentage, game.awayPercentage)}%)
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Team Trends */
          <div className="grid gap-4">
            {getSortedTeamTrends().map((team) => (
              <div key={team.team} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-800">{team.team}</h3>
                  <div className="flex gap-2">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                      {team.wins}-{team.losses} Record
                    </span>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                      {team.gamesFeatured} Games
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">Average Pick %</div>
                    <div className="text-3xl font-bold text-purple-600">
                      {team.averagePickPercentage}%
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">Total Picks</div>
                    <div className="text-3xl font-bold text-blue-600">
                      {team.totalPicks}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-sm text-gray-600 mb-1">Win Rate</div>
                    <div className="text-3xl font-bold text-green-600">
                      {team.gamesFeatured > 0 ? Math.round((team.wins / team.gamesFeatured) * 100) : 0}%
                    </div>
                  </div>
                </div>

                {/* Progress bar for overall popularity */}
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Team Popularity</span>
                    <span>{team.averagePickPercentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-purple-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${team.averagePickPercentage}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

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
              {picks.length}
            </div>
            <div className="text-sm text-gray-600">Total Picks Made</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {games.length}
            </div>
            <div className="text-sm text-gray-600">Total Games</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">
              {teamTrends.length}
            </div>
            <div className="text-sm text-gray-600">Teams Tracked</div>
          </div>
        </div>
      </main>
    </div>
  );
}