"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import NotificationToggle from "@/components/NotificationToggle";

type SeasonStats = {
  season: number;
  totalGames: number;
  totalPicksMade: number;
  correctPicks: number;
  wrongPicks: number;
  missedPicks: number;
  percentage: number;
};

const emptyStats = (season: number): SeasonStats => ({
  season,
  totalGames: 0,
  totalPicksMade: 0,
  correctPicks: 0,
  wrongPicks: 0,
  missedPicks: 0,
  percentage: 0,
});

export default function ProfilePage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [stats2025, setStats2025] = useState<SeasonStats>(emptyStats(2025));
  const [currentSeasonStats, setCurrentSeasonStats] = useState<SeasonStats>(emptyStats(2026));

  useEffect(() => {
    fetchProfile();
    fetchUserStats();
  }, []);

  const calculateStatsForSeason = async (season: number, userId: string): Promise<SeasonStats> => {
    const { data: gamesData, error: gamesError } = await supabase
      .from("games")
      .select("id, winner, status, season")
      .eq("season", season)
      .eq("status", "Final");
    if (gamesError) throw gamesError;

    const { data: picksData, error: picksError } = await supabase
      .from("game_picks")
      .select("game_id, selected_team")
      .eq("user_id", userId);
    if (picksError) throw picksError;

    const finalGames = gamesData || [];
    const userPicks = picksData || [];
    const picksForSeason = userPicks.filter((pick) => finalGames.some((game) => game.id === pick.game_id));
    const correctPicks = picksForSeason.filter((pick) => {
      const game = finalGames.find((g) => g.id === pick.game_id);
      return game?.winner && pick.selected_team === game.winner;
    }).length;
    const totalPicksMade = picksForSeason.length;

    return {
      season,
      totalGames: finalGames.length,
      totalPicksMade,
      correctPicks,
      wrongPicks: totalPicksMade - correctPicks,
      missedPicks: Math.max(finalGames.length - totalPicksMade, 0),
      percentage: totalPicksMade > 0 ? Math.round((correctPicks / totalPicksMade) * 100) : 0,
    };
  };

  const fetchUserStats = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: config } = await supabase.from("season_config").select("season_year").single();
      const activeSeason = config?.season_year ?? 2026;
      const [oldStats, activeStats] = await Promise.all([
        calculateStatsForSeason(2025, user.id),
        calculateStatsForSeason(activeSeason, user.id),
      ]);
      setStats2025(oldStats);
      setCurrentSeasonStats(activeStats);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        router.push("/login");
        return;
      }
      setUserEmail(user.email || null);
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (profileError) {
        if (profileError.code === "PGRST116") {
          await createProfile(user);
          return;
        }
        console.error("Error fetching profile:", profileError);
        return;
      }
      setProfile(profileData);
      setUsername(profileData.username || "");
      setFirstName(profileData.first_name || "");
      setLastName(profileData.last_name || "");
      setIsAdmin(profileData.is_admin || false);
    } catch (error) {
      console.error("Error in fetchProfile:", error);
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async (user: any) => {
    try {
      const newProfile = {
        user_id: user.id,
        username: user.email?.split("@")[0] || `user_${Math.random().toString(36).slice(2, 11)}`,
        first_name: "",
        last_name: "",
        email: user.email!,
        is_admin: false,
      };
      const { data, error } = await supabase.from("profiles").insert([newProfile]).select().single();
      if (error) throw error;
      setProfile(data);
      setUsername(data.username);
      setFirstName(data.first_name);
      setLastName(data.last_name);
      setIsAdmin(data.is_admin);
    } catch (error) {
      console.error("Error creating profile:", error);
    }
  };

  const updateProfile = async () => {
    setSaveError("");
    if (username.trim().length < 3) {
      setSaveError("Username must be at least 3 characters.");
      return;
    }
    try {
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      // Only columns that exist on profiles (there is no updated_at column)
      const { error } = await supabase
        .from("profiles")
        .update({
          username: username.trim(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        })
        .eq("user_id", user.id);
      if (error) throw error;
      await fetchProfile();
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      setSaveError("Couldn't save. That username may already be taken.");
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setSaveError("");
    setUsername(profile?.username || "");
    setFirstName(profile?.first_name || "");
    setLastName(profile?.last_name || "");
  };

  // Admin backup: scores also update automatically on a schedule
  const [updatingScores, setUpdatingScores] = useState(false);
  const [scoreMessage, setScoreMessage] = useState("");

  const handleUpdateScores = async () => {
    if (!isAdmin || updatingScores) return;
    setUpdatingScores(true);
    setScoreMessage("");
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error("Please sign in again before updating scores");
      const response = await fetch("/api/update-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to update scores");
      setScoreMessage(`Updated ${result.refreshed?.length ?? 0} weeks of scores.`);
      await fetchUserStats();
    } catch (err: any) {
      setScoreMessage(err.message || "Score update failed");
    } finally {
      setUpdatingScores(false);
    }
  };

  // Emails a reset link to the signed-in player's address
  const [passwordMessage, setPasswordMessage] = useState("");
  const sendPasswordReset = async () => {
    if (!userEmail) return;
    setPasswordMessage("Sending...");
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPasswordMessage(error ? error.message : `Check ${userEmail} for a link to set a new password.`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const getInitials = () => {
    if (firstName && lastName) return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    return (username || userEmail || "U").charAt(0).toUpperCase();
  };

  if (loading && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-slate-600">
        Loading your profile...
      </div>
    );
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-page">
      {/* Hero */}
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-3xl px-4 pb-16 pt-6">
          <p className="text-sm font-medium text-slate-300">Profile</p>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-2xl font-extrabold text-white ring-4 ring-white/10">
              {getInitials()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-extrabold">{username || "Player"}</h1>
              <p className="truncate text-sm text-slate-300">{fullName || userEmail}</p>
              {isAdmin && (
                <span className="mt-1 inline-block rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                  Admin
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-10 max-w-3xl space-y-5 px-4 pb-6">
        {/* Season cards */}
        <SeasonCard title={`${currentSeasonStats.season} season`} subtitle="So far" stats={currentSeasonStats} highlight />
        <SeasonCard title="2025 season" subtitle="Final" stats={stats2025} />

        {/* Account details */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Account</h2>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100"
              >
                Edit
              </button>
            )}
          </div>

          <div className="space-y-4">
            <Field label="Username" value={username} editing={isEditing} onChange={setUsername} placeholder="At least 3 characters" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First name" value={firstName} editing={isEditing} onChange={setFirstName} />
              <Field label="Last name" value={lastName} editing={isEditing} onChange={setLastName} />
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold text-slate-700">Email</div>
              <div className="break-all text-base text-slate-900">{userEmail}</div>
            </div>
          </div>

          {saveError && (
            <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{saveError}</p>
          )}

          {isEditing && (
            <div className="mt-5 flex gap-3">
              <button
                onClick={updateProfile}
                disabled={saving}
                className="flex-1 rounded-xl bg-emerald-600 py-3 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button
                onClick={cancelEdit}
                className="flex-1 rounded-xl border border-slate-300 py-3 font-semibold text-slate-800 transition-colors hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          )}
        </section>

        <NotificationToggle />

        {isAdmin && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-bold text-amber-900">Admin</h2>
            <p className="mt-1 text-sm text-amber-900">
              Scores update automatically. Use this only to force a refresh of every week so far.
            </p>
            <button
              onClick={handleUpdateScores}
              disabled={updatingScores}
              className="mt-3 w-full rounded-xl bg-slate-900 py-3 font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
            >
              {updatingScores ? "Updating scores..." : "Update scores now"}
            </button>
            {scoreMessage && <p className="mt-2 text-sm font-medium text-amber-900">{scoreMessage}</p>}
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Password</h2>
          <p className="mt-1 text-sm text-slate-700">We'll email you a secure link to choose a new password.</p>
          <button
            onClick={sendPasswordReset}
            className="mt-3 w-full rounded-xl border border-slate-300 py-3 font-semibold text-slate-800 transition-colors hover:bg-slate-100"
          >
            Change password
          </button>
          {passwordMessage && <p className="mt-2 text-sm font-medium text-slate-800">{passwordMessage}</p>}
        </section>

        <button
          onClick={handleLogout}
          className="w-full rounded-2xl border border-rose-200 bg-white py-3 font-semibold text-rose-600 transition-colors hover:bg-rose-50"
        >
          Log out
        </button>
      </main>
    </div>
  );
}

function SeasonCard({
  title,
  subtitle,
  stats,
  highlight = false,
}: {
  title: string;
  subtitle: string;
  stats: SeasonStats;
  highlight?: boolean;
}) {
  const decided = stats.correctPicks + stats.wrongPicks + stats.missedPicks;
  const pct = (n: number) => (decided > 0 ? (n / decided) * 100 : 0);

  return (
    <section
      className={`rounded-2xl border bg-white p-5 shadow-sm ${highlight ? "border-emerald-200" : "border-slate-200"}`}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <span className="text-sm font-medium text-slate-600">{subtitle}</span>
      </div>

      <div className="mt-4 flex items-end gap-6">
        <div>
          <div className="text-5xl font-extrabold leading-none text-slate-900">
            {stats.percentage}
            <span className="text-2xl text-slate-600">%</span>
          </div>
          <div className="mt-1 text-sm font-medium text-slate-600">correct</div>
        </div>
        <div className="grid flex-1 grid-cols-3 gap-2 text-center">
          <Stat value={stats.correctPicks} label="Right" color="text-emerald-700" />
          <Stat value={stats.wrongPicks} label="Wrong" color="text-rose-600" />
          <Stat value={stats.missedPicks} label="Missed" color="text-amber-600" />
        </div>
      </div>

      {decided > 0 && (
        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className="bg-emerald-500" style={{ width: `${pct(stats.correctPicks)}%` }} />
          <div className="bg-rose-400" style={{ width: `${pct(stats.wrongPicks)}%` }} />
          <div className="bg-amber-300" style={{ width: `${pct(stats.missedPicks)}%` }} />
        </div>
      )}
      <p className="mt-2 text-xs font-medium text-slate-600">{stats.totalGames} final games counted</p>
    </section>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="rounded-xl bg-slate-50 py-2">
      <div className={`text-xl font-extrabold ${color}`}>{value}</div>
      <div className="text-xs font-semibold text-slate-600">{label}</div>
    </div>
  );
}

function Field({
  label,
  value,
  editing,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-700">{label}</label>
      {editing ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      ) : (
        <div className="text-base text-slate-900">{value || <span className="text-slate-500">Not set</span>}</div>
      )}
    </div>
  );
}
