"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Pages where the menu should not appear (signed-out screens)
const HIDDEN_ON = ["/login", "/signup", "/reset-password", "/reset-password-request"];

const navItems = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/make-picks", label: "Make Picks", icon: "🏈" },
  { href: "/all-picks", label: "All Picks", icon: "📊" },
  { href: "/pick-summary", label: "Percentages", icon: "📈" },
  { href: "/standings", label: "Standings", icon: "🏆" },
  { href: "/pickem-groups", label: "Groups", icon: "👥" },
  { href: "/rules", label: "Rules", icon: "📋" },
  { href: "/profile", label: "Profile", icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (HIDDEN_ON.includes(pathname)) return null;

  const handleLogout = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      {/* Spacer so page content never hides behind the floating button */}
      <div aria-hidden className="h-28" />

      {/* Dimmed backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[60] bg-slate-950/30 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-label="Menu"
        aria-hidden={!open}
        className={`fixed inset-x-3 z-[70] mx-auto max-w-md rounded-3xl border border-white/15 bg-ink/75 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-2xl transition-all duration-300 ease-out ${
          open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0"
        }`}
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.5rem)" }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/25" />

        <nav className="grid grid-cols-4 gap-2">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-3 text-center transition-colors ${
                  active
                    ? "bg-emerald-500/90 text-white"
                    : "text-slate-200 hover:bg-white/10 active:bg-white/15"
                }`}
              >
                <span className="text-2xl leading-none">{item.icon}</span>
                <span className="text-[11px] font-semibold leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          tabIndex={open ? 0 : -1}
          className="mt-3 w-full rounded-2xl border border-white/10 py-2.5 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/15"
        >
          Log out
        </button>
      </div>

      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="fixed left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-ink/65 px-6 py-3 font-semibold text-white shadow-xl shadow-black/30 backdrop-blur-xl transition-all hover:bg-ink/85 active:scale-95"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        <span className="relative block h-3.5 w-4">
          <span
            className={`absolute left-0 block h-0.5 w-4 rounded bg-white transition-all duration-300 ${
              open ? "top-1.5 rotate-45" : "top-0"
            }`}
          />
          <span
            className={`absolute left-0 top-1.5 block h-0.5 w-4 rounded bg-white transition-opacity duration-200 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`absolute left-0 block h-0.5 w-4 rounded bg-white transition-all duration-300 ${
              open ? "top-1.5 -rotate-45" : "top-3"
            }`}
          />
        </span>
        <span>{open ? "Close" : "Menu"}</span>
      </button>
    </>
  );
}
