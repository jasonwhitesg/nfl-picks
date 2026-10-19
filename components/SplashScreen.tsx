"use client";

import PicksLogo from "@/components/PicksLogo";

export default function SplashScreen({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-ink text-white">
      <PicksLogo className="h-28 w-28 animate-bounce" />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">NFL Picks</h1>
      <p className="mt-1 text-sm text-sky-100/80">{message}</p>
      <div className="mt-8 h-1.5 w-44 overflow-hidden rounded-full bg-white/15">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-400" />
      </div>
    </div>
  );
}
