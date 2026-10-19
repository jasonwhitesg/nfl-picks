// Supabase calls for pick'em group invites, shared by the Home and Groups pages.
import { supabase } from "@/lib/supabaseClient";
import type { MembershipRow } from "@/lib/groups";

export async function loadMemberships(userId: string): Promise<MembershipRow[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("status, groups (id, name, invite_code, owner_user_id, season_year, is_active)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as unknown as MembershipRow[];
}

export async function acceptInvite(groupId: string, userId: string) {
  const { error } = await supabase
    .from("group_members")
    .update({ status: "approved" })
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("status", "invited");
  if (error) throw error;
}

export async function declineInvite(groupId: string, userId: string) {
  // Removing the row lets the owner invite them again later
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("status", "invited");
  if (error) throw error;
}

export async function sendInvite(groupId: string, userId: string) {
  const { error } = await supabase.from("group_members").upsert(
    { group_id: groupId, user_id: userId, role: "member", status: "invited", is_paid: false, paid_at: null },
    { onConflict: "group_id,user_id" }
  );
  if (error) throw error;
}
