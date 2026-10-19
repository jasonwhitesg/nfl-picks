import type { ReactNode } from "react";

// Shared look for the signed-out pages (login, signup, password reset)
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ink px-4 py-10">
      {/* Soft field-green glow behind the card */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-3xl shadow-lg shadow-emerald-500/30">
            🏈
          </div>
          <div className="text-sm font-semibold uppercase tracking-widest text-emerald-300">NFL Picks</div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-300">{subtitle}</p>}
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-2xl shadow-black/30">{children}</div>

        {footer && <div className="mt-6 text-center text-sm text-slate-300">{footer}</div>}
      </div>
    </div>
  );
}

export const authInput =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder:text-slate-500 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

export const authLabel = "mb-1.5 block text-sm font-semibold text-slate-800";

export const authButton =
  "w-full rounded-xl bg-emerald-600 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";

export const authLink = "font-semibold text-emerald-300 hover:text-emerald-200";
