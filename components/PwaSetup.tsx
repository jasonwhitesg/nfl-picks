"use client";
import { useEffect, useState } from "react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaSetup() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true); // hide until we know
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) =>
        console.error("Service worker registration failed:", e)
      );
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setIsStandalone(standalone);
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    try {
      setDismissed(localStorage.getItem("pwa-banner-dismissed") === "1");
    } catch {}

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("pwa-banner-dismissed", "1");
    } catch {}
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  if (isStandalone || dismissed) return null;
  if (!installEvent && !isIos) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-2xl bg-white p-4 shadow-2xl border border-gray-200">
      <div className="flex items-start gap-3">
        <span className="text-3xl">🏈</span>
        <div className="flex-1 text-sm text-gray-800">
          <div className="font-bold">Install NFL Picks</div>
          {installEvent ? (
            <div className="text-gray-600">Add it to your home screen for quick access.</div>
          ) : (
            <div className="text-gray-600">
              Tap the Share button, then “Add to Home Screen”.
            </div>
          )}
        </div>
        <button onClick={dismiss} className="text-gray-400 text-lg" aria-label="Dismiss">
          ✕
        </button>
      </div>
      {installEvent && (
        <button
          onClick={install}
          className="mt-3 w-full rounded-xl bg-blue-600 py-2 font-bold text-white"
        >
          Install
        </button>
      )}
    </div>
  );
}
