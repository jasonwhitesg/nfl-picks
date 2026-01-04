"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [stats, setStats] = useState({
    totalGames: 0,
    winPercentage: 0,
    currentStreak: 0,
    totalWins: 0,
    totalLosses: 0
  });

  // Admin score update states
  const [updatingScores, setUpdatingScores] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const [updateError, setUpdateError] = useState("");

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
    fetchProfile();
    fetchUserStats();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email || null);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        
        if (profileError.code === 'PGRST116') {
          await createProfile(user);
          return;
        }
        return;
      }

      setProfile(profileData);
      setUsername(profileData.username);
      setFirstName(profileData.first_name);
      setLastName(profileData.last_name);
      setIsAdmin(profileData.is_admin || false);
      
    } catch (error) {
      console.error('Error in fetchProfile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserStats = async () => {
    try {
      // This would typically fetch from your picks/games tables
      // For now, using mock data - replace with actual API calls
      const mockStats = {
        totalGames: 24,
        winPercentage: 62.5,
        currentStreak: 3,
        totalWins: 15,
        totalLosses: 9
      };
      setStats(mockStats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const createProfile = async (user: any) => {
    try {
      const newProfile = {
        user_id: user.id,
        username: user.email?.split('@')[0] || `user_${Math.random().toString(36).substr(2, 9)}`,
        first_name: '',
        last_name: '',
        email: user.email!,
        is_admin: false,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('profiles')
        .insert([newProfile])
        .select()
        .single();

      if (error) throw error;

      setProfile(data);
      setUsername(data.username);
      setFirstName(data.first_name);
      setLastName(data.last_name);
      setIsAdmin(data.is_admin);
      
    } catch (error) {
      console.error('Error creating profile:', error);
    }
  };

  const updateProfile = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Basic validation
      if (username.trim().length < 3) {
        alert('Username must be at least 3 characters long');
        return;
      }

      const updates = {
        username: username.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchProfile();
      setIsEditing(false);
      
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Error updating profile. Username might already be taken.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getInitials = () => {
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    return userEmail?.charAt(0).toUpperCase() || "U";
  };

  // Admin: Update NFL Scores Function
  const handleUpdateScores = async () => {
    if (!isAdmin) {
      setUpdateError("Access denied: Admin privileges required");
      return;
    }

    setUpdatingScores(true);
    setUpdateMessage("");
    setUpdateError("");

    try {
      const response = await fetch("/api/update-scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update scores");
      }

      setUpdateMessage(result.message || "Scores updated successfully!");
      
      // Refresh stats or show success message
      setTimeout(() => {
        setUpdateMessage("");
        // You might want to refresh page data here
      }, 3000);

    } catch (err: any) {
      setUpdateError(err.message || "An error occurred while updating scores");
    } finally {
      setUpdatingScores(false);
    }
  };

  if (loading && !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-xl text-gray-600">Loading your profile...</p>
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
              title={headerExpanded ? "Collapse menu" : "Expand menu"}
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
                {getInitials()}
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
                    <div className="text-xl font-bold text-blue-600">{stats.totalGames}</div>
                    <div className="text-xs text-blue-800">Games</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-green-600">{stats.totalWins}</div>
                    <div className="text-xs text-green-800">Wins</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="text-xl font-bold text-purple-600">{stats.currentStreak}</div>
                    <div className="text-xs text-purple-800">Streak</div>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4 space-y-3">
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-600">🔧</span>
                      <span className="text-sm font-semibold text-yellow-800">Admin Mode Active</span>
                    </div>
                  </div>
                  
                  {/* Admin Action Button in Header Menu */}
                  <button
                    onClick={handleUpdateScores}
                    disabled={updatingScores}
                    className="w-full bg-green-500 text-white px-4 py-3 rounded-lg font-medium hover:bg-green-600 transition-colors disabled:bg-green-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {updatingScores ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Updating Scores...
                      </>
                    ) : (
                      <>
                        <span>🏈</span>
                        Update NFL Scores
                      </>
                    )}
                  </button>
                  
                  {updateMessage && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-700 font-medium">{updateMessage}</p>
                    </div>
                  )}
                  
                  {updateError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700 font-medium">{updateError}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-6xl mx-auto">
        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Your Profile
          </h1>
          <p className="text-lg text-gray-600">
            Manage your account and track your performance
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Profile Info */}
          <div className="lg:col-span-2 space-y-8">
            {/* Profile Information */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Profile Information</h2>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-600 transition-colors"
                >
                  {isEditing ? 'Cancel Editing' : 'Edit Profile'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter username"
                      minLength={3}
                    />
                  ) : (
                    <p className="text-lg text-gray-800 bg-gray-50 p-3 rounded-lg">
                      {username || "Not set"}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <p className="text-lg text-gray-800 bg-gray-50 p-3 rounded-lg">
                    {userEmail}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter first name"
                    />
                  ) : (
                    <p className="text-lg text-gray-800 bg-gray-50 p-3 rounded-lg">
                      {firstName || "Not set"}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter last name"
                    />
                  ) : (
                    <p className="text-lg text-gray-800 bg-gray-50 p-3 rounded-lg">
                      {lastName || "Not set"}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Type
                  </label>
                  <div className="flex items-center gap-2">
                    <p className="text-lg text-gray-800 bg-gray-50 p-3 rounded-lg flex-1">
                      {isAdmin ? 'Administrator' : 'Standard User'}
                    </p>
                    {isAdmin && (
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm font-medium">
                        Admin
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Member Since
                  </label>
                  <p className="text-lg text-gray-800 bg-gray-50 p-3 rounded-lg">
                    {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : 'N/A'}
                  </p>
                </div>
              </div>

              {isEditing && (
                <div className="mt-6 flex gap-4">
                  <button
                    onClick={updateProfile}
                    disabled={loading}
                    className="bg-green-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      // Reset form values
                      setUsername(profile?.username || '');
                      setFirstName(profile?.first_name || '');
                      setLastName(profile?.last_name || '');
                    }}
                    className="bg-gray-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Performance Stats */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-6">Performance Stats</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-2">{stats.totalGames}</div>
                  <div className="text-blue-800 font-medium">Total Games</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600 mb-2">{stats.winPercentage}%</div>
                  <div className="text-green-800 font-medium">Win Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600 mb-2">{stats.currentStreak}</div>
                  <div className="text-purple-800 font-medium">Current Streak</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-orange-600 mb-2">{stats.totalWins}-{stats.totalLosses}</div>
                  <div className="text-orange-800 font-medium">Win-Loss</div>
                </div>
              </div>
              
              {/* Win/Loss Bar */}
              {stats.totalGames > 0 && (
                <div className="mt-6">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Wins: {stats.totalWins}</span>
                    <span>Losses: {stats.totalLosses}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div 
                      className="bg-green-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${stats.winPercentage}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {/* Admin Section - Only visible to admins */}
            {isAdmin && (
              <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl shadow-sm p-8">
                <h2 className="text-2xl font-bold text-yellow-800 mb-4 flex items-center gap-2">
                  <span>🔧</span> Admin Controls
                </h2>
                
                <div className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-yellow-700 mb-2">Update NFL Scores</h3>
                    <p className="text-yellow-600 mb-4">
                      This will fetch the latest NFL scores from ESPN and update the database.
                      Only use this when games are complete or scores need to be refreshed.
                    </p>
                    
                    <div className="space-y-3">
                      <button
                        onClick={handleUpdateScores}
                        disabled={updatingScores}
                        className="w-full bg-green-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-600 transition-colors disabled:bg-green-400 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                      >
                        {updatingScores ? (
                          <>
                            <span className="animate-spin">⏳</span>
                            Updating NFL Scores...
                          </>
                        ) : (
                          <>
                            <span className="text-xl">🏈</span>
                            Update NFL Scores Now
                          </>
                        )}
                      </button>
                      
                      {updateMessage && (
                        <div className="p-4 bg-green-100 border border-green-300 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-green-600">✅</span>
                            <p className="text-green-800 font-medium">{updateMessage}</p>
                          </div>
                        </div>
                      )}
                      
                      {updateError && (
                        <div className="p-4 bg-red-100 border border-red-300 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className="text-red-600">❌</span>
                            <p className="text-red-800 font-medium">{updateError}</p>
                          </div>
                        </div>
                      )}
                      
                      <div className="text-sm text-yellow-700 p-3 bg-yellow-100 rounded-lg">
                        <p className="font-semibold mb-1">Note:</p>
                        <ul className="list-disc pl-5 space-y-1">
                          <li>Updates scores for the current week automatically</li>
                          <li>Also updates Monday Night Football total points if game is final</li>
                          <li>This process may take a few seconds</li>
                          <li>Games will be marked as "Final" when scores are updated</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Additional Features */}
          <div className="space-y-8">
            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button 
                  onClick={() => router.push('/make-picks')}
                  className="w-full bg-blue-500 text-white py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors text-center"
                >
                  Make This Week's Picks
                </button>
                <button 
                  onClick={() => router.push('/all-picks')}
                  className="w-full bg-green-500 text-white py-3 rounded-lg font-medium hover:bg-green-600 transition-colors text-center"
                >
                  View My Picks
                </button>
                <button 
                  onClick={() => router.push('/standings')}
                  className="w-full bg-purple-500 text-white py-3 rounded-lg font-medium hover:bg-purple-600 transition-colors text-center"
                >
                  Check Standings
                </button>
                
                {/* Admin-specific quick action */}
                {isAdmin && (
                  <button 
                    onClick={() => router.push('/profiles')}
                    className="w-full bg-yellow-500 text-white py-3 rounded-lg font-medium hover:bg-yellow-600 transition-colors text-center"
                  >
                    View All Profiles
                  </button>
                )}
              </div>
            </div>

            {/* Coming Soon Features */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
              <h3 className="text-xl font-bold text-yellow-800 mb-4">Coming Soon</h3>
              <ul className="text-yellow-700 space-y-3">
                <li className="flex items-center gap-2">
                  <span className="text-yellow-600">📊</span>
                  <span>Personal statistics and performance history</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-yellow-600">🖼️</span>
                  <span>Profile picture upload</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-yellow-600">🔔</span>
                  <span>Notification preferences</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-yellow-600">🏅</span>
                  <span>Personal achievement badges</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-yellow-600">📈</span>
                  <span>Pick history and analysis</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-yellow-600">👥</span>
                  <span>Friends and leaderboards</span>
                </li>
              </ul>
            </div>

            {/* Account Status */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
              <h3 className="text-xl font-bold text-green-800 mb-2">Account Status</h3>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-green-700 font-medium">Active</span>
              </div>
              <p className="text-green-600 text-sm">
                Your account is in good standing. All features are available.
              </p>
              
              {isAdmin && (
                <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-yellow-700">🔧</span>
                    <span className="text-sm font-semibold text-yellow-800">Administrator Privileges</span>
                  </div>
                  <p className="text-xs text-yellow-700">
                    You have access to admin features including score updates and user management.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}