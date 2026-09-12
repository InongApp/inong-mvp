"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type PremiumFeatureKey = "visuals_images" | "digital_friend_custom" | "attachments";

const FEATURE_COPY: Record<
  PremiumFeatureKey,
  { title: string; freeGets: string; premiumUnlocks: string }
> = {
  visuals_images: {
    title: "Real AI-generated images",
    freeGets: "You can already play Visuals in Words — describing what you picture in your own words, or guessing each other's riddles.",
    premiumUnlocks: "Premium turns your description into an actual AI-generated image, so you see what your Inong pictured, not just read it.",
  },
  digital_friend_custom: {
    title: "Build Your Own Digital Friend",
    freeGets: "You can already practice against Karabo — five free personalities, three difficulty levels, unlimited solo play.",
    premiumUnlocks: "Premium lets you describe your real friend's personality and practice against a simulation built just for them.",
  },
  attachments: {
    title: "Photos & voice notes",
    freeGets: "Every conversation in the app — comments, Just Because, all of it — already works with text and emoji, no limits.",
    premiumUnlocks: "Premium adds real photo and voice note sharing, so a dare like \"send a throwback photo\" can actually include one.",
  },
};

export default function PremiumNudge({
  feature,
  onClose,
}: {
  feature: PremiumFeatureKey;
  onClose: () => void;
}) {
  const [joined, setJoined] = useState(false);
  const copy = FEATURE_COPY[feature];

  async function joinWaitlist() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;
    await supabase.from("premium_interest").insert({
      profile_id: session.user.id,
      feature,
    });
    setJoined(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 sm:items-center">
      <div className="w-full max-w-md rounded-t-card bg-ink px-6 py-6 sm:rounded-card">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-coral">
            ✨ Premium
          </p>
          <button onClick={onClose} className="text-mute hover:text-paper">
            ✕
          </button>
        </div>

        <h2 className="font-serif mt-3 text-xl font-semibold text-paper">
          {copy.title}
        </h2>

        <div className="mt-4 space-y-3">
          <div className="rounded-card bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-mute">
              What you already have, free
            </p>
            <p className="mt-1 text-sm text-paper">{copy.freeGets}</p>
          </div>
          <div className="rounded-card bg-coral/10 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-coral">
              What Premium adds
            </p>
            <p className="mt-1 text-sm text-paper">{copy.premiumUnlocks}</p>
          </div>
        </div>

        {joined ? (
          <p className="mt-6 text-center text-sm text-coral">
            You're on the list — we'll let you know the moment it's ready. 🎉
          </p>
        ) : (
          <button
            onClick={joinWaitlist}
            className="mt-6 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
          >
            Notify me when Premium is ready
          </button>
        )}
        <button
          onClick={onClose}
          className="mt-3 w-full text-center text-sm text-mute hover:text-paper"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

