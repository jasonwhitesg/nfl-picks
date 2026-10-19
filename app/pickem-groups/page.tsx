"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import GroupInvites from "@/components/GroupInvites";
import { inviteCandidates, makeInviteCode, splitMemberships, type GroupInfo, type PlayerProfile } from "@/lib/groups";
import { loadMemberships, sendInvite } from "@/lib/groupActions";

type GroupMember = {
  id: string;
  group_id: string;
  user_id: string;
  role: string;
  status: "invited" | "approved" | "pending" | "denied";
  is_paid: boolean;
  paid_at: string | null;
  profile?: PlayerProfile & { email?: string };
};

const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const input =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-500 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-600/20";

export default function PickemGroupsPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [seasonYear, setSeasonYear] = useState(2026);
  const [loading, setLoading] = useState(true);

  const [groupName, setGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [memberships, setMemberships] = useState<ReturnType<typeof splitMemberships>>({
    invites: [],
    joined: [],
    requested: [],
  });
  const [selectedGroup, setSelectedGroup] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerProfile[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (text: string) => {
    setError("");
    setMessage(text);
    setTimeout(() => setMessage(""), 4000);
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

      const { data: config } = await supabase.from("season_config").select("season_year").single();
      const activeSeason = config?.season_year ?? 2026;
      setSeasonYear(activeSeason);

      const { data: players } = await supabase
        .from("profiles")
        .select("user_id, username, first_name, last_name")
        .order("username");
      setAllPlayers(players ?? []);

      // Open a specific group if the link asked for one (?group=<id>)
      const wanted = new URLSearchParams(window.location.search).get("group");
      await refreshMemberships(user.id, activeSeason, wanted);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error loading groups");
    } finally {
      setLoading(false);
    }
  };

  const refreshMemberships = async (uid: string, season: number, preferGroupId?: string | null) => {
    const split = splitMemberships(await loadMemberships(uid), season);
    setMemberships(split);
    const visible = [...split.joined, ...split.requested];
    const next =
      visible.find((g) => g.id === (preferGroupId ?? selectedGroup?.id)) ?? visible[0] ?? null;
    setSelectedGroup(next);
    if (next) await fetchMembers(next.id);
    else setMembers([]);
  };

  const fetchMembers = async (groupId: string) => {
    const { data: memberData, error: memberError } = await supabase
      .from("group_members")
      .select("id, group_id, user_id, role, status, is_paid, paid_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true });
    if (memberError) throw memberError;

    const userIds = (memberData || []).map((m) => m.user_id);
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, username, first_name, last_name, email")
      .in("user_id", userIds);
    if (profileError) throw profileError;

    setMembers(
      (memberData || []).map((m) => ({
        ...m,
        profile: profileData?.find((p) => p.user_id === m.user_id),
      })) as GroupMember[]
    );
  };

  const createGroup = async () => {
    try {
      setError("");
      if (!userId) return;
      if (groupName.trim().length < 3) {
        setError("Group name must be at least 3 characters.");
        return;
      }
      const { data: group, error: groupError } = await supabase
        .from("groups")
        .insert({
          name: groupName.trim(),
          owner_user_id: userId,
          season_year: seasonYear,
          invite_code: makeInviteCode(),
          is_active: true,
        })
        .select()
        .single();
      if (groupError) throw groupError;

      const { error: memberError } = await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: userId,
        role: "owner",
        status: "approved",
        is_paid: true,
        paid_at: new Date().toISOString(),
      });
      if (memberError) throw memberError;

      setGroupName("");
      flash(`Created ${group.name}. Now invite some players below.`);
      await refreshMemberships(userId, seasonYear, group.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error creating group");
    }
  };

  const joinGroup = async () => {
    try {
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
        setError("No active group found with that code.");
        return;
      }
      const { error: joinError } = await supabase.from("group_members").upsert(
        { group_id: group.id, user_id: userId, role: "member", status: "pending", is_paid: false, paid_at: null },
        { onConflict: "group_id,user_id" }
      );
      if (joinError) throw joinError;

      setJoinCode("");
      flash(`Request sent to ${group.name}. The owner needs to approve it.`);
      await refreshMemberships(userId, seasonYear, group.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error joining group");
    }
  };

  const invitePlayer = async (player: PlayerProfile) => {
    if (!selectedGroup) return;
    setInvitingId(player.user_id);
    try {
      await sendInvite(selectedGroup.id, player.user_id);
      flash(`Invited ${player.username}. They'll see it on their Home page.`);
      await fetchMembers(selectedGroup.id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error sending invite");
    } finally {
      setInvitingId(null);
    }
  };

  const updateMember = async (member: GroupMember, changes: Partial<GroupMember>) => {
    try {
      if (!isOwner) return;
      const { error } = await supabase.from("group_members").update(changes).eq("id", member.id);
      if (error) throw error;
      await fetchMembers(member.group_id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error updating member");
    }
  };

  const cancelInvite = async (member: GroupMember) => {
    try {
      if (!isOwner) return;
      const { error } = await supabase.from("group_members").delete().eq("id", member.id).eq("status", "invited");
      if (error) throw error;
      await fetchMembers(member.group_id);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error cancelling invite");
    }
  };

  const selectGroup = async (group: GroupInfo) => {
    setSelectedGroup(group);
    setInviteSearch("");
    await fetchMembers(group.id);
  };

  const copyInviteCode = async () => {
    if (!selectedGroup) return;
    try {
      await navigator.clipboard.writeText(selectedGroup.invite_code);
      flash(`Copied code ${selectedGroup.invite_code}`);
    } catch {
      flash(`Code: ${selectedGroup.invite_code}`);
    }
  };

  const displayName = (m: GroupMember) => {
    const p = m.profile;
    if (!p) return "Unknown player";
    const full = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    return full ? `${p.username} · ${full}` : p.username;
  };

  const isOwner = !!selectedGroup && selectedGroup.owner_user_id === userId;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-page text-slate-700">Loading groups...</div>;
  }

  const approved = members.filter((m) => m.status === "approved");
  const pending = members.filter((m) => m.status === "pending");
  const invited = members.filter((m) => m.status === "invited");
  const candidates = isOwner ? inviteCandidates(allPlayers, members, inviteSearch) : [];
  const myGroups = [...memberships.joined, ...memberships.requested];

  return (
    <div className="min-h-screen bg-page">
      <PageHeader title="Pick'em Groups" subtitle={`Season ${seasonYear}`} icon="👥" />

      <main className="mx-auto -mt-10 max-w-3xl space-y-4 px-4 pb-6">
        {message && (
          <div className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm">{message}</div>
        )}
        {error && (
          <div className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white shadow-sm">{error}</div>
        )}

        {/* Invites waiting for me */}
        {userId && (
          <GroupInvites
            userId={userId}
            invites={memberships.invites}
            joined={[]}
            showJoined={false}
            onChange={() => refreshMemberships(userId, seasonYear)}
          />
        )}

        {/* My groups */}
        {myGroups.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {myGroups.map((g) => {
              const isRequested = memberships.requested.some((r) => r.id === g.id);
              const selected = selectedGroup?.id === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => selectGroup(g)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    selected ? "bg-ink text-white shadow-sm" : "border border-slate-200 bg-white text-slate-800 hover:border-sky-400"
                  }`}
                >
                  {g.name}
                  {isRequested && " ⏳"}
                </button>
              );
            })}
          </div>
        )}

        {/* Selected group */}
        {selectedGroup ? (
          <section className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900">{selectedGroup.name}</h2>
                <p className="text-sm text-slate-700">{isOwner ? "You run this group" : "Member"}</p>
              </div>
              <button
                onClick={copyInviteCode}
                className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100"
                title="Copy invite code"
              >
                <span className="font-mono tracking-widest">{selectedGroup.invite_code}</span>
                <span>📋</span>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {[
                { n: approved.length, label: "Members", color: "text-slate-900" },
                { n: invited.length + pending.length, label: "Waiting", color: "text-amber-700" },
                { n: approved.filter((m) => m.is_paid).length, label: "Paid", color: "text-emerald-700" },
                { n: approved.filter((m) => !m.is_paid).length, label: "Unpaid", color: "text-rose-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-slate-50 py-2">
                  <div className={`text-xl font-extrabold ${s.color}`}>{s.n}</div>
                  <div className="text-xs font-semibold text-slate-700">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Members */}
            <h3 className="mb-2 mt-5 font-bold text-slate-900">Members</h3>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {[...approved, ...pending, ...invited].map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-slate-900">
                      {displayName(m)}
                      {m.role === "owner" && <span className="ml-1 text-xs font-bold text-sky-700">OWNER</span>}
                    </div>
                    <div className="mt-0.5 flex gap-1.5">
                      {m.status === "approved" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            m.is_paid ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {m.is_paid ? "PAID" : "UNPAID"}
                        </span>
                      )}
                      {m.status === "pending" && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                          ASKED TO JOIN
                        </span>
                      )}
                      {m.status === "invited" && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-900">
                          INVITE SENT
                        </span>
                      )}
                    </div>
                  </div>

                  {isOwner && m.role !== "owner" && (
                    <div className="flex gap-2">
                      {m.status === "pending" && (
                        <>
                          <button
                            onClick={() => updateMember(m, { status: "approved" })}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => updateMember(m, { status: "denied", is_paid: false, paid_at: null })}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-800 hover:bg-slate-100"
                          >
                            Deny
                          </button>
                        </>
                      )}
                      {m.status === "approved" && (
                        <button
                          onClick={() =>
                            updateMember(m, {
                              is_paid: !m.is_paid,
                              paid_at: m.is_paid ? null : new Date().toISOString(),
                            })
                          }
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-800 hover:bg-slate-100"
                        >
                          {m.is_paid ? "Mark unpaid" : "Mark paid"}
                        </button>
                      )}
                      {m.status === "invited" && (
                        <button
                          onClick={() => cancelInvite(m)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-800 hover:bg-slate-100"
                        >
                          Cancel invite
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* Invite players (owner only) */}
            {isOwner && (
              <div className="mt-5">
                <h3 className="mb-2 font-bold text-slate-900">Invite players</h3>
                <input
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  placeholder="Search by username or name"
                  className={input}
                />
                <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {candidates.length === 0 ? (
                    <li className="px-3 py-3 text-sm text-slate-700">
                      {inviteSearch ? "No players match that search." : "Everyone's already in or invited."}
                    </li>
                  ) : (
                    candidates.map((p) => (
                      <li key={p.user_id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">{p.username}</div>
                          {(p.first_name || p.last_name) && (
                            <div className="truncate text-xs text-slate-700">
                              {p.first_name} {p.last_name}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => invitePlayer(p)}
                          disabled={invitingId === p.user_id}
                          className="shrink-0 rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-60"
                        >
                          {invitingId === p.user_id ? "Sending..." : "Invite"}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}

            {!isOwner && (
              <p className="mt-4 text-sm text-slate-700">Only the group owner can approve players and track payments.</p>
            )}
          </section>
        ) : (
          memberships.invites.length === 0 && (
            <section className={`${card} text-center`}>
              <div className="text-4xl">👥</div>
              <h2 className="mt-2 text-lg font-bold text-slate-900">You're not in a group yet</h2>
              <p className="text-sm text-slate-700">Start your own below, or join one with a code from a friend.</p>
            </section>
          )
        )}

        {/* Create + join */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section className={card}>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Start a group</h2>
            <p className="mb-3 text-sm text-slate-700">You'll be the owner and can invite players.</p>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className={input}
            />
            <button
              onClick={createGroup}
              className="mt-3 w-full rounded-xl bg-ink py-3 font-bold text-white transition-colors hover:bg-ink-deep"
            >
              Create group
            </button>
          </section>

          <section className={card}>
            <h2 className="mb-1 text-lg font-bold text-slate-900">Join with a code</h2>
            <p className="mb-3 text-sm text-slate-700">The owner approves your request.</p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className={`${input} font-mono uppercase tracking-widest`}
            />
            <button
              onClick={joinGroup}
              className="mt-3 w-full rounded-xl bg-emerald-600 py-3 font-bold text-white transition-colors hover:bg-emerald-700"
            >
              Ask to join
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
