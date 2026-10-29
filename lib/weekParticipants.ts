// One pick is enough to participate, even when none of that player's picks may
// be read yet. Do not infer participation from the RLS-filtered selections.
export function weekParticipantProfiles<T extends { user_id: string }>(
  profiles: T[], userIds: string[]
): T[] {
  const participants = new Set(userIds);
  return profiles.filter(profile => participants.has(profile.user_id));
}
