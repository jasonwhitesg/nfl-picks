"use client";

import Link from "next/link";
import { useState } from "react";
import type { GroupInfo } from "@/lib/groups";
import { acceptInvite, declineInvite } from "@/lib/groupActions";

// Invite cards + "your groups" list. Used on Home and the Groups page.
export default function GroupInvites({
  userId,
  invites,
  joined,
  requested = [],
  onChange,
  showJoined = true,
}: {
  userId: string;
  invites: GroupInfo[];
  joined: GroupInfo[];
  requested?: GroupInfo[];
  onChange: () => void;
  showJoined?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const answer = async (group: GroupInfo, accept: boolean) => {
    setBusy(group.id);
    setError("");
    try {
      if (accept) await acceptInvite(group.id, userId);
      else await declineInvite(group.id, userId);
      onChange();
    } catch (err) {
      console.error(err);
      setError("Couldn't update that invite. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (invites.length === 0 && (!showJoined || (joined.length === 0 && requested.length === 0))) return null;

  return (
    <div className="space-y-3">
      {invites.map((g) => (
        <div key={g.id} className="rounded-2xl border border-sky-300 bg-white p-4 shadow-sm ring-4 ring-sky-100">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-2xl">✉️</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-wide text-sky-700">Group invite</div>
              <div className="truncate text-lg font-extrabold text-slate-900">{g.name}</div>
              <p className="text-sm text-slate-700">You've been invited to join this pick'em group.</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => answer(g, true)}
              disabled={busy === g.id}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy === g.id ? "Saving..." : "Accept"}
            </button>
            <button
              onClick={() => answer(g, false)}
              disabled={busy === g.id}
              className="flex-1 rounded-xl border border-slate-300 py-2.5 font-bold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-60"
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

      {showJoined && (joined.length > 0 || requested.length > 0) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Your groups</h3>
            <Link href="/pickem-groups" className="text-sm font-semibold text-sky-700 hover:text-sky-800">
              Manage
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {joined.map((g) => (
              <Link
                key={g.id}
                href={`/pickem-groups?group=${g.id}`}
                className="rounded-full bg-sky-100 px-3 py-1.5 text-sm font-bold text-sky-900 hover:bg-sky-200"
              >
                👥 {g.name}
              </Link>
            ))}
            {requested.map((g) => (
              <span key={g.id} className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900">
                ⏳ {g.name} (waiting)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
