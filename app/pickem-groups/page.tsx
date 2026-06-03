"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

type PickemGroup = {
  id: string;
  name: string;
  invite_code: string;
  owner_user_id: string;
  season_year: number;
  is_active: boolean;
  created_at: string;
};

type GroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  status: "approved" | "pending" | "denied";
  is_paid: boolean;
  paid_at: string | null;
  profiles?: {
    user_id: string;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
  }[];
};

export default function PickemGroupsPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [seasonYear, setSeasonYear] = useState(2026);
  const [loading, setLoading] = useState(true);

  const [groupName, setGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [myGroups, setMyGroups] = useState<PickemGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<PickemGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  useEffect(() => {
    loadPage();
  }, []);

  const makeInviteCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

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

      setUserId(user.id);
      setUserEmail(user.email || null);

      const { data: config } = await supabase
        .from("season_config")
        .select("season_year")
        .single();

      const activeSeason = config?.season_year ?? 2026;
      setSeasonYear(activeSeason);

      await fetchMyGroups(user.id, activeSeason);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error loading groups");
    } finally {
      setLoading(false);
    }
  };

  const fetchMyGroups = async (
    currentUserId: string,
    activeSeason: number
  ) => {
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
          is_active,
          created_at
        )
      `)
      .eq("user_id", currentUserId)
      .neq("status", "denied");

    if (error) throw error;

    const groups =
      data
        ?.map((row: any) => row.groups)
        .filter(
          (group: PickemGroup | null) =>
            group && group.season_year === activeSeason
        ) || [];

    setMyGroups(groups);

    if (groups.length > 0 && !selectedGroup) {
      setSelectedGroup(groups[0]);
      await fetchMembers(groups[0].id);
    }
  };

 const fetchMembers = async (groupId: string) => {
  const { data: memberData, error: memberError } = await supabase
    .from("group_members")
    .select(`
      id,
      group_id,
      user_id,
      role,
      status,
      is_paid,
      paid_at
    `)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (memberError) throw memberError;

  const userIds = (memberData || []).map((member) => member.user_id);

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, username, first_name, last_name, email")
    .in("user_id", userIds);

  if (profileError) throw profileError;

  const membersWithProfiles = (memberData || []).map((member) => {
    const profile = profileData?.find(
      (profile) => profile.user_id === member.user_id
    );

    return {
      ...member,
      profiles: profile ? [profile] : [],
    };
  });

  setMembers(membersWithProfiles as GroupMember[]);
};

    const createGroup = async () => {
      try {
        setMessage("");
        setError("");

        if (!userId) return;

        if (groupName.trim().length < 3) {
          setError("Group name must be at least 3 characters.");
          return;
        }

      const inviteCode = makeInviteCode();

      const { data: group, error: groupError } = await supabase
        .from("groups")
        .insert({
          name: groupName.trim(),
          owner_user_id: userId,
          season_year: seasonYear,
          invite_code: inviteCode,
          is_active: true,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      const { error: memberError } = await supabase
        .from("group_members")
        .insert({
          group_id: group.id,
          user_id: userId,
          role: "owner",
          status: "approved",
          is_paid: true,
          paid_at: new Date().toISOString(),
        });

      if (memberError) throw memberError;

      setGroupName("");
      setSelectedGroup(group);
      setMessage(`Group created. Invite code: ${group.invite_code}`);

      await fetchMyGroups(userId, seasonYear);
      await fetchMembers(group.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error creating group");
    }
  };

  const joinGroup = async () => {
    try {
      setMessage("");
      setError("");

      if (!userId) return;

      const code = joinCode.trim().toUpperCase();

      if (!code) {
        setError("Enter an invite code.");
        return;
      }

      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("invite_code", code)
        .eq("is_active", true)
        .single();

      if (groupError || !group) {
        setError("No active group found with that invite code.");
        return;
      }

      const { error: joinError } = await supabase
        .from("group_members")
        .upsert(
          {
            group_id: group.id,
            user_id: userId,
            role: "member",
            status: "pending",
            is_paid: false,
            paid_at: null,
          },
          {
            onConflict: "group_id,user_id",
          }
        );

      if (joinError) throw joinError;

      setJoinCode("");
      setSelectedGroup(group);
      setMessage(`Request sent to join ${group.name}. Waiting for owner approval.`);

      await fetchMyGroups(userId, seasonYear);
      await fetchMembers(group.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error joining group");
    }
  };

  const approveMember = async (member: GroupMember) => {
    try {
      if (!selectedGroup || selectedGroup.owner_user_id !== userId) return;

      const { error } = await supabase
        .from("group_members")
        .update({ status: "approved" })
        .eq("id", member.id);

      if (error) throw error;

      await fetchMembers(member.group_id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error approving member");
    }
  };

  const denyMember = async (member: GroupMember) => {
    try {
      if (!selectedGroup || selectedGroup.owner_user_id !== userId) return;

      const { error } = await supabase
        .from("group_members")
        .update({
          status: "denied",
          is_paid: false,
          paid_at: null,
        })
        .eq("id", member.id);

      if (error) throw error;

      await fetchMembers(member.group_id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error denying member");
    }
  };

  const togglePaid = async (member: GroupMember) => {
    try {
      if (!selectedGroup || selectedGroup.owner_user_id !== userId) return;

      const newPaidStatus = !member.is_paid;

      const { error } = await supabase
        .from("group_members")
        .update({
          is_paid: newPaidStatus,
          paid_at: newPaidStatus ? new Date().toISOString() : null,
        })
        .eq("id", member.id);

      if (error) throw error;

      await fetchMembers(member.group_id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error updating paid status");
    }
  };

  const selectGroup = async (group: PickemGroup) => {
    setSelectedGroup(group);
    await fetchMembers(group.id);
  };

  const copyInviteCode = async () => {
    if (!selectedGroup) return;

    await navigator.clipboard.writeText(selectedGroup.invite_code);
    setMessage(`Copied invite code: ${selectedGroup.invite_code}`);
  };

  const getDisplayName = (member: GroupMember) => {
    const profile = member.profiles?.[0];

    if (!profile) return member.user_id;

    if (profile.first_name || profile.last_name) {
      return `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
    }

    return profile.username || profile.email;
  };

  const getApprovedMembers = () => {
    return members.filter((member) => member.status === "approved");
  };

  const isOwner = selectedGroup?.owner_user_id === userId;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-700">Loading groups...</div>
      </div>
    );
  }

  const approvedMembers = getApprovedMembers();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-2xl font-bold text-gray-800">Pick'em Groups</h1>

          <div className="flex items-center gap-4">
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium text-gray-700">{userEmail}</p>
              <p className="text-xs text-gray-500">Season {seasonYear}</p>
            </div>

            <button
              onClick={() => router.push("/profile")}
              className="bg-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-600"
            >
              Profile
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 flex gap-2 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${
                item.href === "/pickem-groups"
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
          <h2 className="text-4xl font-bold text-gray-800 mb-3">Groups</h2>
          <p className="text-gray-600 text-lg">
            Create a private pick'em group, invite players, approve requests, and track payments.
          </p>
        </div>

        {message && (
          <div className="mb-6 bg-green-50 border border-green-300 text-green-800 rounded-lg p-4">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-300 text-red-800 rounded-lg p-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              Create Group
            </h3>

            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Example: Honda Pick'em League"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4"
            />

            <button
              onClick={createGroup}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700"
            >
              ➕ Create Group
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              Request to Join Group
            </h3>

            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter invite code"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4 uppercase"
            />

            <button
              onClick={joinGroup}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700"
            >
              🔎 Request to Join
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">
              My Groups
            </h3>

            {myGroups.length === 0 ? (
              <p className="text-gray-500">You are not in any groups yet.</p>
            ) : (
              <div className="space-y-3">
                {myGroups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => selectGroup(group)}
                    className={`w-full text-left p-4 rounded-lg border transition ${
                      selectedGroup?.id === group.id
                        ? "bg-blue-50 border-blue-400"
                        : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <div className="font-bold text-gray-800">{group.name}</div>
                    <div className="text-sm text-gray-500">
                      Code: {group.invite_code}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            {!selectedGroup ? (
              <div className="text-center text-gray-500 py-12">
                Select or create a group.
              </div>
            ) : (
              <>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800">
                      {selectedGroup.name}
                    </h3>
                    <p className="text-gray-500">
                      Invite Code:{" "}
                      <span className="font-bold text-gray-800">
                        {selectedGroup.invite_code}
                      </span>
                    </p>
                  </div>

                  <button
                    onClick={copyInviteCode}
                    className="bg-gray-800 text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-900"
                  >
                    Copy Invite Code
                  </button>
                </div>

                <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {approvedMembers.length}
                    </div>
                    <div className="text-sm text-blue-800">Approved</div>
                  </div>

                  <div className="bg-yellow-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {members.filter((m) => m.status === "pending").length}
                    </div>
                    <div className="text-sm text-yellow-800">Pending</div>
                  </div>

                  <div className="bg-green-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {approvedMembers.filter((m) => m.is_paid).length}
                    </div>
                    <div className="text-sm text-green-800">Paid</div>
                  </div>

                  <div className="bg-orange-50 p-4 rounded-lg text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {approvedMembers.filter((m) => !m.is_paid).length}
                    </div>
                    <div className="text-sm text-orange-800">Unpaid</div>
                  </div>
                </div>

                <h4 className="text-xl font-bold text-gray-800 mb-4">
                  Members
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-3 text-left">Player</th>
                        <th className="border p-3 text-left">Role</th>
                        <th className="border p-3 text-left">Status</th>
                        <th className="border p-3 text-left">Paid</th>
                        {isOwner && (
                          <th className="border p-3 text-left">Action</th>
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {members.map((member) => (
                        <tr key={member.id}>
                          <td className="border p-3">
                            <div className="font-semibold text-gray-800">
                              {getDisplayName(member)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {member.profiles?.[0]?.email}
                            </div>
                          </td>

                          <td className="border p-3 capitalize">
                            {member.role}
                          </td>

                          <td className="border p-3 capitalize">
                            {member.status === "approved" && (
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-bold">
                                Approved
                              </span>
                            )}

                            {member.status === "pending" && (
                              <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm font-bold">
                                Pending
                              </span>
                            )}

                            {member.status === "denied" && (
                              <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm font-bold">
                                Denied
                              </span>
                            )}
                          </td>

                          <td className="border p-3">
                            {member.status !== "approved" ? (
                              <span className="text-gray-400 text-sm">
                                Not active
                              </span>
                            ) : member.is_paid ? (
                              <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-bold">
                                Paid
                              </span>
                            ) : (
                              <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm font-bold">
                                Unpaid
                              </span>
                            )}
                          </td>

                          {isOwner && (
                            <td className="border p-3">
                              {member.status === "pending" && (
                                <div className="flex gap-2 mb-2">
                                  <button
                                    onClick={() => approveMember(member)}
                                    className="px-3 py-2 rounded text-white text-sm font-semibold bg-green-500 hover:bg-green-600"
                                  >
                                    Approve
                                  </button>

                                  <button
                                    onClick={() => denyMember(member)}
                                    className="px-3 py-2 rounded text-white text-sm font-semibold bg-red-500 hover:bg-red-600"
                                  >
                                    Deny
                                  </button>
                                </div>
                              )}

                              {member.status === "approved" && (
                                <button
                                  onClick={() => togglePaid(member)}
                                  className={`px-3 py-2 rounded text-white text-sm font-semibold ${
                                    member.is_paid
                                      ? "bg-red-500 hover:bg-red-600"
                                      : "bg-green-500 hover:bg-green-600"
                                  }`}
                                >
                                  {member.is_paid ? "Mark Unpaid" : "Mark Paid"}
                                </button>
                              )}

                              {member.status === "denied" && (
                                <button
                                  onClick={() => approveMember(member)}
                                  className="px-3 py-2 rounded text-white text-sm font-semibold bg-green-500 hover:bg-green-600"
                                >
                                  Approve Again
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!isOwner && (
                  <p className="text-sm text-gray-500 mt-4">
                    Only the group owner can approve members and change paid status.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}