"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { leagueLabel, LeagueKey } from "@/lib/leagues";
import {
  WINDOW_LABELS,
  WindowLabel,
  windowLabelText,
  Challenge,
  createChallenge,
  getChallengesForRoom,
  markReady,
} from "@/lib/showdownChallenges";
import { startShowdownFromChallenge } from "@/lib/showdowns";

export default function CompetePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [leagueKey, setLeagueKey] = useState<LeagueKey | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<WindowLabel | null>(null);
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markingReady, setMarkingReady] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000); // catches the other Pair starting the match first
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace("/login");
      return;
    }

    const { data: room } = await supabase
      .from("rooms")
      .select("league_key")
      .eq("id", params.roomId)
      .maybeSingle();
    setLeagueKey(room?.league_key ?? null);

    const list = await getChallengesForRoom(params.roomId);

    const started = list.find((c) => c.status === "in_progress" && c.showdown_id);
    if (started) {
      router.replace(`/rooms/${params.roomId}/showdown-match/${started.showdown_id}`);
      return;
    }

    setChallenges(list);
    setLoading(false);
  }

  async function handleCreate() {
    if (!selectedWindow) return;
    setCreating(true);
    try {
      const result = await createChallenge(params.roomId, leagueKey, selectedWindow);
      if (result) {
        setNewLink(`${window.location.origin}/showdown/${result.code}`);
        setSelectedWindow(null);
        load();
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleMarkReady(challenge: Challenge, side: "challenger" | "challenged") {
    setMarkingReady(challenge.id);
    try {
      await markReady(challenge.id, side);
      load();
    } finally {
      setMarkingReady(null);
    }
  }

  async function handleStart(challenge: Challenge) {
    setStartingId(challenge.id);
    try {
      const showdownId = await startShowdownFromChallenge(challenge);
      if (showdownId) {
        router.push(`/rooms/${params.roomId}/showdown-match/${showdownId}`);
      } else {
        // Most likely the other Pair already started it a moment ago —
        // reload to pick up their showdown_id instead of erroring.
        load();
      }
    } finally {
      setStartingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => router.push(`/rooms/${params.roomId}`)}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← Back to room
      </button>

      <h1 className="font-serif mt-4 text-2xl font-semibold">🏆 Compete</h1>
      <p className="mt-1 text-sm text-mute">
        {leagueLabel(leagueKey)} League — challenge a Pair you know.
      </p>

      {newLink && (
        <div className="mt-4 rounded-card bg-coral/10 px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-coral">
            Challenge created — share this link
          </p>
          <div className="mt-2 break-all rounded-card bg-surface px-3 py-3 text-sm text-paper">
            {newLink}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(newLink);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="mt-3 rounded-full border border-mute px-4 py-2 text-sm text-paper transition hover:border-paper"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      )}

      <div className="mt-6 rounded-card bg-surface px-4 py-4">
        <p className="text-xs uppercase tracking-wide text-mute">
          When do you want to play?
        </p>
        <div className="mt-2 space-y-1.5">
          {WINDOW_LABELS.map((w) => (
            <button
              key={w.key}
              onClick={() => setSelectedWindow(w.key)}
              className={`w-full rounded-card border px-3 py-2 text-left text-sm transition ${
                selectedWindow === w.key
                  ? "border-coral text-coral"
                  : "border-mute text-paper hover:border-paper"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleCreate}
          disabled={!selectedWindow || creating}
          className="mt-3 w-full rounded-full bg-coral py-3 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Create challenge"}
        </button>
        <p className="mt-2 text-xs text-mute">
          This just sets expectations, not a fixed time — the match starts
          the moment you're both ready, any time within the window.
        </p>
      </div>

      {challenges.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-xs uppercase tracking-wide text-mute">
            Your challenges
          </p>
          {challenges.map((c) => {
            const isChallenger = c.challenger_room_id === params.roomId;
            const mySide = isChallenger ? "challenger" : "challenged";
            const myReady = isChallenger ? c.challenger_ready_at : c.challenged_ready_at;
            const theirReady = isChallenger ? c.challenged_ready_at : c.challenger_ready_at;

            return (
              <div key={c.id} className="rounded-card border border-mute px-4 py-3">
                <p className="text-sm text-paper">
                  {windowLabelText(c.window_label)}
                </p>
                <p className="mt-0.5 text-xs text-mute">
                  {c.status === "pending_accept" && "Waiting for the other Pair to accept"}
                  {c.status === "awaiting_ready" &&
                    (myReady
                      ? "You're ready — waiting on them"
                      : theirReady
                      ? "They're ready — your turn"
                      : "Both sides need to tap ready")}
                  {c.status === "ready_to_start" && "Both ready — let's go!"}
                </p>
                {c.status === "awaiting_ready" && !myReady && (
                  <button
                    onClick={() => handleMarkReady(c, mySide)}
                    disabled={markingReady === c.id}
                    className="mt-2 rounded-full bg-coral px-4 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
                  >
                    {markingReady === c.id ? "..." : "I'm ready!"}
                  </button>
                )}
                {c.status === "ready_to_start" && (
                  <button
                    onClick={() => handleStart(c)}
                    disabled={startingId === c.id}
                    className="mt-2 rounded-full bg-coral px-4 py-1.5 text-xs font-medium text-ink disabled:opacity-50"
                  >
                    {startingId === c.id ? "Starting..." : "🏆 Start Showdown"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

