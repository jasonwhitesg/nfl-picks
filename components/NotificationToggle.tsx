"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Status = "checking" | "unsupported" | "ios-browser" | "no-key" | "blocked" | "off" | "on";

type Prefs = {
  remind_1d: boolean;
  remind_2h: boolean;
  remind_1h: boolean;
  game_results: boolean;
  weekly_winner: boolean;
  group_invites: boolean;
};

// Same defaults as the notification_prefs table (used until a player changes something)
const DEFAULT_PREFS: Prefs = {
  remind_1d: false,
  remind_2h: false,
  remind_1h: true,
  game_results: false,
  weekly_winner: true,
  group_invites: true,
};

const CHOICES: { key: keyof Prefs; label: string; group: "reminders" | "other" }[] = [
  { key: "remind_1d", label: "1 day before", group: "reminders" },
  { key: "remind_2h", label: "2 hours before", group: "reminders" },
  { key: "remind_1h", label: "1 hour before", group: "reminders" },
  { key: "game_results", label: "Game results (each final score, and if your pick was right)", group: "other" },
  { key: "weekly_winner", label: "Weekly winner", group: "other" },
  { key: "group_invites", label: "Group invites", group: "other" },
];

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

// The push service wants the public key as raw bytes, not base64url text.
function keyToBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// Saves this phone's push address so the server can reach it.
async function saveSubscription(sub: PushSubscription) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
}

export default function NotificationToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [prefsMessage, setPrefsMessage] = useState("");

  // Load this player's saved choices once notifications are on
  useEffect(() => {
    if (status !== "on") return;
    supabase
      .from("notification_prefs")
      .select("remind_1d, remind_2h, remind_1h, game_results, weekly_winner, group_invites")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPrefs(data as Prefs);
      });
  }, [status]);

  const changePref = async (key: keyof Prefs, value: boolean) => {
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setPrefsMessage("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = user
      ? await supabase
          .from("notification_prefs")
          .upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      : { error: new Error("Please sign in again.") };
    if (error) {
      console.error("Saving notification choices failed:", error);
      setPrefs(previous);
      setPrefsMessage("Couldn't save that change. Please try again.");
    }
  };

  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    if (!supported) return setStatus(isIos && !standalone ? "ios-browser" : "unsupported");
    if (!VAPID_PUBLIC_KEY) return setStatus("no-key");
    if (Notification.permission === "denied") return setStatus("blocked");

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        if (!sub) return setStatus("off");
        setStatus("on");
        // Keep the saved row in step with this phone (e.g. after signing in as someone else).
        await saveSubscription(sub).catch(() => {});
      })
      .catch(() => setStatus("off"));
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) }));
      await saveSubscription(sub);
      setStatus("on");
    } catch (err: any) {
      console.error("Turning on notifications failed:", err);
      setMessage(err?.message || "Couldn't turn on notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        if (error) throw error;
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (err: any) {
      console.error("Turning off notifications failed:", err);
      setMessage(err?.message || "Couldn't turn off notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
        {status === "on" && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">On</span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-700">
        Get a reminder before games lock if you still have picks to make, plus group invites and weekly winners.
      </p>

      {status === "ios-browser" && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
          On iPhone, notifications only work from the Home Screen app. Tap the Share button, choose “Add to Home
          Screen”, then open NFL Picks from that icon and come back here.
        </p>
      )}
      {status === "unsupported" && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
          This browser can't show notifications. Try Chrome or Safari on your phone.
        </p>
      )}
      {status === "no-key" && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
          Notifications aren't set up yet. Check back soon.
        </p>
      )}
      {status === "blocked" && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          Notifications are blocked for this app. Allow them in your phone's Settings, then come back here.
        </p>
      )}

      {status === "off" && (
        <button
          onClick={turnOn}
          disabled={busy}
          className="mt-3 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Turning on..." : "Turn on notifications"}
        </button>
      )}
      {status === "on" && (
        <div className="mt-4 space-y-4">
          <div>
            <div className="text-sm font-semibold text-slate-700">Remind me if I still have picks to make</div>
            <div className="mt-1 divide-y divide-slate-100">
              {CHOICES.filter((c) => c.group === "reminders").map((c) => (
                <Choice key={c.key} label={c.label} checked={prefs[c.key]} onChange={(v) => changePref(c.key, v)} />
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-700">Also tell me about</div>
            <div className="mt-1 divide-y divide-slate-100">
              {CHOICES.filter((c) => c.group === "other").map((c) => (
                <Choice key={c.key} label={c.label} checked={prefs[c.key]} onChange={(v) => changePref(c.key, v)} />
              ))}
            </div>
          </div>
          {prefsMessage && <p className="text-sm font-medium text-rose-700">{prefsMessage}</p>}
        </div>
      )}
      {status === "on" && (
        <button
          onClick={turnOff}
          disabled={busy}
          className="mt-3 w-full rounded-xl border border-slate-300 py-3 font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-60"
        >
          {busy ? "Turning off..." : "Turn off notifications"}
        </button>
      )}
      {message && <p className="mt-2 text-sm font-medium text-rose-700">{message}</p>}
    </section>
  );
}

function Choice({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2.5">
      <span className="text-base text-slate-900">{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/40 ${
          checked ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
    </label>
  );
}
