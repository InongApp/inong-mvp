"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PushOptIn() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    check();
  }, []);

  async function check() {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }
    if (Notification.permission === "denied") return;
    if (Notification.permission === "granted") return;

    const dismissedAt = localStorage.getItem("inong_push_dismissed");
    if (
      dismissedAt &&
      Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000
    ) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;

    setVisible(true);
  }

  async function enable() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      const registration = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const json = subscription.toJSON();
      await supabase.from("push_subscriptions").upsert(
        {
          profile_id: session.user.id,
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
        { onConflict: "endpoint" }
      );

      setVisible(false);
    } catch {
      setVisible(false);
    }
  }

  function dismiss() {
    localStorage.setItem("inong_push_dismissed", String(Date.now()));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-card bg-surface px-4 py-3 text-sm">
      <span className="text-paper">
        Get notified the moment your Inong replies
      </span>
      <div className="flex shrink-0 gap-3">
        <button onClick={dismiss} className="text-mute hover:text-paper">
          Not now
        </button>
        <button
          onClick={enable}
          className="font-medium text-coral hover:underline"
        >
          Enable
        </button>
      </div>
    </div>
  );
}

