"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

interface PlayerStats {
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  total_games: number;
  correct_picks: number;
  win_percentage: number;
  current_streak: number;
  best_streak: number;
  weekly_wins: number;
  total_paid: number;
  rank: number;
}

interface WeeklyWinner {
  season: number;
  week: number;
  player_name: string;
  correct_picks: number;
  tiebreaker: number | null;
  is_paid_winner: boolean;
  is_tied: boolean;
}

interface SeasonConfig {
  current_week: number;
  season_year: number;
}

export default function StandingsPage() {
  const router = useRouter();
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [weeklyWinners, setWeeklyWinners] = useState<WeeklyWinner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'standings' | 'weekly' | 'history'>('standings');
  const [seasonConfig, setSeasonConfig] = useState<SeasonConfig>({ current_week: 1, season_year: 2025 });

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
    fetchSeasonConfig();
    fetchStandingsData();
  }, [activeTab]);

  const fetchUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || null);
        
        // Check if user is admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('user_id', user.id)
          .single();
        
        setIsAdmin(profile?.is_admin || false);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const fetchSeasonConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('season_config')
        .select('*')
        .single();

      if (error) throw error;
      if (data) {
        setSeasonConfig({
          current_week: data.current_week,
          season_year: data.season_year
        });
      }
    } catch (error) {
      console.error('Error fetching season config:', error);
    }
  };

  const fetchStandingsData = async () => {
    try {
      setLoading(true);

      if (activeTab === 'standings') {
        await fetchPlayerStats();
      } else if (activeTab === 'weekly') {
        await fetchWeeklyWinners();
      } else if (activeTab === 'history') {
        await fetchHistoricalData();
      }

    } catch (error) {
      console.error('Error fetching standings data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayerStats = async () => {
    try {
      // First, get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, username, first_name, last_name, email, created_at')
        .order('username');

      if (profilesError) throw profilesError;

      if (!profiles || profiles.length === 0) {
        setPlayerStats([]);
        return;
      }

      // For each profile, calculate their stats
      const statsPromises = profiles.map(async (profile) => {
        // Get user's game picks
        const { data: picks, error: picksError } = await supabase
          .from('game_picks')
          .select('*')
          .eq('user_id', profile.user_id);

        if (picksError) throw picksError;

        // Get games data to check results
        const { data: games, error: gamesError } = await supabase
          .from('games')
          .select('id, winner, start_time')
          .not('winner', 'is', null);

        if (gamesError) throw gamesError;

        // Calculate stats
        const totalGames = picks?.length || 0;
        let correctPicks = 0;
        let currentStreak = 0;
        let bestStreak = 0;
        let tempStreak = 0;

        // Sort picks by game start time to calculate streaks properly
        const sortedPicks = picks?.sort((a, b) => {
          const gameA = games?.find(g => g.id === a.game_id);
          const gameB = games?.find(g => g.id === b.game_id);
          return new Date(gameA?.start_time || 0).getTime() - new Date(gameB?.start_time || 0).getTime();
        }) || [];

        sortedPicks.forEach(pick => {
          const game = games?.find(g => g.id === pick.game_id);
          if (game && game.winner === pick.selected_team) {
            correctPicks++;
            tempStreak++;
            currentStreak = tempStreak;
            bestStreak = Math.max(bestStreak, tempStreak);
          } else {
            tempStreak = 0;
          }
        });

        // Get weekly wins count
        const { data: weeklyWinsData, error: weeklyWinsError } = await supabase
          .from('weekly_winners')
          .select('id')
          .eq('player_name', profile.username)
          .eq('season', seasonConfig.season_year);

        const weeklyWins = weeklyWinsData?.length || 0;

        // Get total payments
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('weekly_payments')
          .select('id')
          .eq('user_id', profile.user_id)
          .eq('is_paid', true)
          .eq('season_year', seasonConfig.season_year);

        const totalPaid = (paymentsData?.length || 0) * 25; // Assuming $25 per win

        const winPercentage = totalGames > 0 ? Math.round((correctPicks / totalGames) * 100 * 10) / 10 : 0;

        return {
          user_id: profile.user_id,
          username: profile.username,
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
          total_games: totalGames,
          correct_picks: correctPicks,
          win_percentage: winPercentage,
          current_streak: currentStreak,
          best_streak: bestStreak,
          weekly_wins: weeklyWins,
          total_paid: totalPaid,
          rank: 0 // Will be calculated after sorting
        };
      });

      const allStats = await Promise.all(statsPromises);

      // Sort by correct picks (primary) and win percentage (secondary)
      const sortedStats = allStats
        .filter(stats => stats.total_games > 0) // Only show players who have made picks
        .sort((a, b) => {
          if (b.correct_picks !== a.correct_picks) {
            return b.correct_picks - a.correct_picks;
          }
          return b.win_percentage - a.win_percentage;
        })
        .map((stats, index) => ({
          ...stats,
          rank: index + 1
        }));

      setPlayerStats(sortedStats);

    } catch (error) {
      console.error('Error fetching player stats:', error);
    }
  };

  const fetchWeeklyWinners = async () => {
    try {
      const { data, error } = await supabase
        .from('weekly_winners')
        .select('*')
        .eq('season', seasonConfig.season_year)
        .order('week', { ascending: false });

      if (error) throw error;
      setWeeklyWinners(data || []);
    } catch (error) {
      console.error('Error fetching weekly winners:', error);
    }
  };

  const fetchHistoricalData = async () => {
    // Fetch historical standings data
    // This would typically involve multiple season data
    console.log('Fetching historical data...');
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return 'bg-yellow-100 border-yellow-300';
      case 2: return 'bg-gray-100 border-gray-300';
      case 3: return 'bg-orange-100 border-orange-300';
      default: return 'bg-white border-gray-200';
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  };

  const getDisplayName = (player: PlayerStats) => {
    if (player.first_name && player.last_name) {
      return `${player.first_name} ${player.last_name}`;
    }
    return player.username;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-xl text-gray-600">Loading standings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Expandable Header Bar - Opens to the Left */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        {/* Main Header Bar */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            {/* Expand Button */}
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

            {/* Logo/Title */}
            <h1 className="text-2xl font-bold text-gray-800">NFL Picks</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {/* User Info */}
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

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="bg-red-500 text-white px-3 py-2 rounded text-sm font-medium hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Expandable Navigation Panel - Opens to the Left */}
        {headerExpanded && (
          <div className="absolute top-full left-0 w-80 bg-white border-b border-r border-gray-200 shadow-lg z-40">
            <div className="p-6">
              {/* Navigation Header */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Navigation</h2>
                <p className="text-sm text-gray-600">Quick access to all features</p>
              </div>

              {/* Navigation Grid */}
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

              {/* Quick Stats */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="font-semibold text-gray-800 mb-3">Quick Stats</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-blue-600">{playerStats.length}</div>
                    <div className="text-xs text-blue-800">Players</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-green-600">
                      {playerStats.reduce((sum, player) => sum + player.total_games, 0)}
                    </div>
                    <div className="text-xs text-green-800">Total Picks</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-purple-600">{seasonConfig.current_week}</div>
                    <div className="text-xs text-purple-800">Week</div>
                  </div>
                </div>
              </div>

              {/* Admin Badge */}
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
            Season {seasonConfig.season_year} Standings
          </h1>
          <p className="text-lg text-gray-600">
            Track player rankings and season performance
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-8">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('standings')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeTab === 'standings'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              🏆 Current Standings
            </button>
            <button
              onClick={() => setActiveTab('weekly')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeTab === 'weekly'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              📅 Weekly Winners
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              📊 Season History
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'standings' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">Season {seasonConfig.season_year} Leaderboard</h2>
                  <div className="text-sm text-gray-600">
                    Week {seasonConfig.current_week} • Updated just now
                  </div>
                </div>

                {/* Leaderboard */}
                {playerStats.length > 0 ? (
                  <div className="space-y-4">
                    {playerStats.map((player) => (
                      <div
                        key={player.user_id}
                        className={`border rounded-lg p-6 transition-all hover:shadow-md ${getRankColor(player.rank)}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="text-2xl font-bold w-12 text-center">
                              {getRankIcon(player.rank)}
                            </div>
                            <div>
                              <h3 className="text-xl font-semibold text-gray-800">
                                {getDisplayName(player)}
                              </h3>
                              <p className="text-gray-600">@{player.username}</p>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="text-2xl font-bold text-gray-800">
                              {player.correct_picks}-{player.total_games - player.correct_picks}
                            </div>
                            <div className="text-lg font-semibold text-green-600">
                              {player.win_percentage}%
                            </div>
                          </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200">
                          <div className="text-center">
                            <div className="text-sm text-gray-600">Current Streak</div>
                            <div className="text-lg font-semibold text-green-600">
                              {player.current_streak} {player.current_streak > 0 ? '🔥' : ''}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-gray-600">Best Streak</div>
                            <div className="text-lg font-semibold text-blue-600">
                              {player.best_streak}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-gray-600">Weekly Wins</div>
                            <div className="text-lg font-semibold text-purple-600">
                              {player.weekly_wins}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-gray-600">Total Winnings</div>
                            <div className="text-lg font-semibold text-yellow-600">
                              ${player.total_paid}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">📊</div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">No Player Data Yet</h3>
                    <p className="text-gray-600">Player statistics will appear here once games start and picks are made.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'weekly' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Weekly Winners - Season {seasonConfig.season_year}</h2>
                
                {weeklyWinners.length > 0 ? (
                  <div className="grid gap-4">
                    {weeklyWinners.map((winner, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-6 bg-white">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-xl font-semibold text-gray-800">
                              Week {winner.week} Winner{winner.is_tied ? 's (Tied)' : ''}
                            </h3>
                            <p className="text-gray-600">{winner.player_name}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-green-600">
                              {winner.correct_picks} Correct
                            </div>
                            {winner.tiebreaker && (
                              <div className="text-sm text-gray-600">
                                Tiebreaker: {winner.tiebreaker} pts
                              </div>
                            )}
                          </div>
                        </div>
                        {winner.is_paid_winner && (
                          <div className="mt-3 inline-flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                            💰 Paid Winner
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">📅</div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">No Weekly Winners Yet</h3>
                    <p className="text-gray-600">Weekly winners will appear here as the season progresses.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Season History</h2>
                
                {/* Placeholder for historical data */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
                  <div className="text-6xl mb-4">📊</div>
                  <h3 className="text-2xl font-bold text-yellow-800 mb-4">
                    Historical Data Coming Soon
                  </h3>
                  <p className="text-yellow-700 mb-4">
                    This section is being developed. Check back soon for:
                  </p>
                  <ul className="text-yellow-700 text-left max-w-md mx-auto space-y-2">
                    <li>• Multi-season performance tracking</li>
                    <li>• Year-over-year comparisons</li>
                    <li>• All-time leaderboards</li>
                    <li>• Career statistics</li>
                    <li>• Hall of Fame</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Cards */}
        <div className="grid grid-cols-1 md:grid-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {playerStats.length}
            </div>
            <div className="text-gray-600 font-medium">Active Players</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {playerStats.reduce((sum, player) => sum + player.weekly_wins, 0)}
            </div>
            <div className="text-gray-600 font-medium">Weekly Wins</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <div className="text-3xl font-bold text-purple-600 mb-2">
              {playerStats.length > 0 ? Math.max(...playerStats.map(p => p.best_streak)) : 0}
            </div>
            <div className="text-gray-600 font-medium">Best Streak</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <div className="text-3xl font-bold text-yellow-600 mb-2">
              ${playerStats.reduce((sum, player) => sum + player.total_paid, 0)}
            </div>
            <div className="text-gray-600 font-medium">Total Paid Out</div>
          </div>
        </div>
      </main>
    </div>
  );
}