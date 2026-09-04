"use client";

import { useEffect, useState } from "react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    const dismissedAt = localStorage.getItem("inong_install_dismissed");
    if (
      dismissedAt &&
      Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000
    ) {
      return;
    }

    const iOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIsIOS(iOS);

    if (iOS) {
      setVisible(true);
      return;
    }

    function handler(e: any) {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  }

  function dismiss() {
    localStorage.setItem("inong_install_dismissed", String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mb-4 rounded-card bg-surface px-4 py-3 text-sm">
      {isIOS ? (
        <p className="text-paper">
          Add INONG to your home screen: tap{" "}
          <span className="font-medium">Share</span>, then{" "}
          <span className="font-medium">Add to Home Screen</span>.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-paper">Add INONG to your home screen</span>
          <div className="flex shrink-0 gap-3">
            <button onClick={dismiss} className="text-mute hover:text-paper">
              Not now
            </button>
            <button
              onClick={install}
              className="font-medium text-coral hover:underline"
            >
              Install
            </button>
          </div>
        </div>
      )}
      {isIOS && (
        <button
          onClick={dismiss}
          className="mt-2 text-xs text-mute hover:text-paper"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

