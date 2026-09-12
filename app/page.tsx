"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session?.user));
  }, []);

  if (loggedIn === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading...
      </div>
    );
  }

  // ---------- Logged out: public landing ----------
  if (!loggedIn) {
    return (
      <div className="flex flex-1 flex-col justify-between">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="font-serif text-3xl font-semibold leading-tight">
            Who&rsquo;s your
            <br />
            Inong?
          </h1>
          <p className="mt-4 max-w-xs text-mute">
            Choose the person who matters to you. Then find out how well you
            two actually know each other.
          </p>
        </div>

        <Link
          href="/login"
          className="w-full rounded-full bg-coral py-4 text-center font-medium text-ink transition hover:opacity-90"
        >
          Get started
        </Link>
        <Link
          href="/about"
          className="mt-3 block text-center text-sm text-mute hover:text-paper"
        >
          About INONG™ & how to play
        </Link>
      </div>
    );
  }

  // ---------- Logged in: Home — where every session actually starts ----------
  return (
    <div className="flex flex-1 flex-col">
      <img
        src="/home/hero-mego-dego.jpg"
        alt="Play INONG — just 15 minutes to talk, laugh, discover, reconnect"
        className="w-full rounded-card"
      />

      <div className="mt-6 space-y-2">
        <button
          onClick={() => router.push("/digital-friend")}
          className="w-full rounded-card bg-coral px-5 py-4 text-left transition hover:opacity-90"
        >
          <p className="font-medium text-ink">🤖 Play with Karabo</p>
          <p className="mt-0.5 text-xs text-ink/70">
            Your Digital Friend — for whenever you're curious, no partner needed.
          </p>
        </button>

        <button
          onClick={() => router.push("/rooms/new")}
          className="w-full rounded-card border border-skyblue px-5 py-4 text-left text-skyblue transition hover:bg-skyblue hover:text-ink"
        >
          <p className="font-medium">👤 Invite a One-on-One Player</p>
          <p className="mt-0.5 text-xs opacity-80">
            Generate an invite and send it to your Inong.
          </p>
        </button>

        <div className="w-full rounded-card border border-mute px-5 py-4 text-left text-mute opacity-60">
          <div className="flex items-center justify-between">
            <p className="font-medium">👥 Generate Group Invite</p>
            <span className="shrink-0 rounded-full border border-mute px-2 py-0.5 text-[10px] uppercase tracking-wide">
              Unlocks soon
            </span>
          </div>
          <p className="mt-0.5 text-xs">Up to 12 close people, plus you.</p>
        </div>

        <div className="w-full rounded-card border border-mute px-5 py-4 text-left text-mute opacity-60">
          <div className="flex items-center justify-between">
            <p className="font-medium">👨‍👩‍👧 Generate Family Invite</p>
            <span className="shrink-0 rounded-full border border-mute px-2 py-0.5 text-[10px] uppercase tracking-wide">
              Unlocks soon
            </span>
          </div>
          <p className="mt-0.5 text-xs">Unlimited members.</p>
        </div>
      </div>

      <Link
        href="/rooms"
        className="mt-6 block text-center text-sm text-coral hover:underline"
      >
        📋 My Rooms
      </Link>
      <Link
        href="/about"
        className="mt-2 block text-center text-sm text-mute hover:text-paper"
      >
        About INONG™ & how to play
      </Link>
    </div>
  );
}

