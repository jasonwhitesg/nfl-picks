// Pick'em group membership logic (pure functions, no Supabase calls).
//
// group_members.status values:
//   "invited"  - the owner invited this player; they haven't answered yet
//   "pending"  - the player asked to join with a code; owner hasn't approved yet
//   "approved" - in the group
//   "denied"   - owner turned down the request

export type MemberStatus = "invited" | "pending" | "approved" | "denied";

export type GroupInfo = {
  id: string;
  name: string;
  invite_code: string;
  owner_user_id: string;
  season_year: number;
  is_active: boolean;
};

export type MembershipRow = {
  status: MemberStatus | string;
  groups: GroupInfo | null;
};

export type PlayerProfile = {
  user_id: string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
};

// Sort one player's memberships into what the Home and Groups pages show.
// Only active groups for the given season count.
export function splitMemberships(rows: MembershipRow[], season: number) {
  const invites: GroupInfo[] = [];
  const joined: GroupInfo[] = [];
  const requested: GroupInfo[] = [];

  for (const row of rows) {
    const g = row.groups;
    if (!g || !g.is_active || g.season_year !== season) continue;
    if (row.status === "invited") invites.push(g);
    else if (row.status === "approved") joined.push(g);
    else if (row.status === "pending") requested.push(g);
  }

  const byName = (a: GroupInfo, b: GroupInfo) => a.name.localeCompare(b.name);
  return { invites: invites.sort(byName), joined: joined.sort(byName), requested: requested.sort(byName) };
}

// Players the owner can still invite: everyone not already invited, pending
// or in the group. Players who were denied can be invited again.
export function inviteCandidates(
  players: PlayerProfile[],
  members: { user_id: string; status: string }[],
  search = ""
): PlayerProfile[] {
  const blocked = new Set(members.filter((m) => m.status !== "denied").map((m) => m.user_id));
  const q = search.trim().toLowerCase();

  return players
    .filter((p) => !blocked.has(p.user_id))
    .filter((p) => {
      if (!q) return true;
      const name = `${p.username} ${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      return name.includes(q);
    })
    .sort((a, b) => a.username.localeCompare(b.username));
}

// Simple, readable invite codes (no 0/O or 1/I mix-ups)
export function makeInviteCode(random: () => number = Math.random, length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(random() * chars.length)];
  return code;
}
