"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { randomChallenge } from "@/lib/challenges";
import CommentThread from "@/components/CommentThread";

type Surprise = {
  id: string;
  prompt: string;
  category: string;
  is_dare: boolean;
  timer_minutes: number | null;
  status: "active" | "done" | "skipped";
};

export default function SurpriseOrDarePage() {
  const params = useParams<{ roomId: string; mode: string }>();
  const router = useRouter();
  const isDareMode = params.mode === "dare";

  const [userId, setUserId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("your Inong");
  const [current, setCurrent] = useState<Surprise | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-side countdown — resets on refresh, which is fine for a
  // playful pressure timer, not a scored mechanic.
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.mode]);

  useEffect(() => {
    if (!timerRunning || secondsLeft === null) return;
    if (secondsLeft <= 0) {
      setTimerRunning(false);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [timerRunning, secondsLeft]);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace("/login");
      return;
    }
    setUserId(session.user.id);

    const { data: memberRows } = await supabase
      .from("room_members")
      .select("profile_id, profiles(display_name)")
      .eq("room_id", params.roomId);
    const other: any = (memberRows ?? []).find((m: any) => m.profile_id !== session.user.id);
    if (other) setFriendName(other.profiles?.display_name ?? "your Inong");

    const { data: all } = await supabase
      .from("surprises")
      .select("id, prompt, category, is_dare, timer_minutes, status")
      .eq("room_id", params.roomId)
      .eq("is_dare", isDareMode)
      .order("created_at", { ascending: false });

    setDoneCount((all ?? []).filter((s: any) => s.status === "done").length);

    const active = (all ?? []).find((s: any) => s.status === "active");
    setCurrent((active as Surprise) ?? null);
    setLoading(false);
  }

  async function drawNew() {
    if (!userId) return;
    setDrawing(true);
    setError(null);
    try {
      const { data: all } = await supabase
        .from("surprises")
        .select("prompt")
        .eq("room_id", params.roomId)
        .eq("is_dare", isDareMode);
      const used = (all ?? []).map((s: any) => s.prompt);

      const { data: room } = await supabase
        .from("rooms")
        .select("relationship_mode")
        .eq("id", params.roomId)
        .maybeSingle();

      const challenge = randomChallenge(used, isDareMode, room?.relationship_mode ?? null);
      if (!challenge) {
        setError("Couldn't draw one — try again.");
        return;
      }

      const { error: insertErr } = await supabase.from("surprises").insert({
        room_id: params.roomId,
        prompt: challenge.prompt,
        category: challenge.category,
        is_dare: challenge.isDare,
        timer_minutes: challenge.timerMinutes ?? null,
        created_by: userId,
      });
      if (insertErr) {
        setError(insertErr.message);
        return;
      }
      setSecondsLeft(null);
      setTimerRunning(false);
      load();
    } finally {
      setDrawing(false);
    }
  }

  async function resolve(status: "done" | "skipped") {
    if (!current) return;
    await supabase
      .from("surprises")
      .update({ status, resolved_at: new Date().toISOString() })
      .eq("id", current.id);
    setSecondsLeft(null);
    setTimerRunning(false);
    load();
  }

  function startTimer() {
    if (!current?.timer_minutes) return;
    setSecondsLeft(current.timer_minutes * 60);
    setTimerRunning(true);
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading...
      </div>
    );
  }

  const accent = isDareMode ? "coral" : "skyblue";

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => router.push(`/rooms/${params.roomId}/surprise-me`)}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← Back
      </button>

      <div className="mb-4 mt-4 rounded-card bg-surface px-4 py-2 text-xs text-mute">
        {isDareMode ? "🔥 Dare mode" : "🎁 Surprise mode"} · {doneCount}{" "}
        done together
      </div>

      {current ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div
            className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full text-3xl ${
              accent === "coral" ? "bg-coral" : "bg-skyblue"
            }`}
          >
            {isDareMode ? "🔥" : "🎁"}
          </div>
          <p className="text-sm uppercase tracking-wide text-mute">
            {isDareMode ? "Today's Dare" : "Surprise"}
          </p>
          <h1 className="font-serif mt-3 text-2xl font-semibold leading-snug">
            {current.prompt}
          </h1>

          {isDareMode && current.timer_minutes && (
            <div className="mt-6 flex flex-col items-center">
              {secondsLeft !== null ? (
                <>
                  <p
                    className={`font-serif text-4xl font-semibold ${
                      secondsLeft <= 0 ? "text-mute" : "text-coral"
                    }`}
                  >
                    {formatTime(Math.max(secondsLeft, 0))}
                  </p>
                  {secondsLeft <= 0 && (
                    <p className="mt-1 text-xs text-mute">
                      Time&rsquo;s up — no penalty, just how it went.
                    </p>
                  )}
                </>
              ) : (
                <button
                  onClick={startTimer}
                  className="rounded-full bg-coral px-6 py-3 text-sm font-medium text-ink transition hover:opacity-90"
                >
                  ▶ Start {current.timer_minutes}:00 timer
                </button>
              )}
            </div>
          )}

          <div className="mt-10 w-full space-y-3">
            <button
              onClick={() => resolve("done")}
              className={`w-full rounded-full py-4 font-medium text-ink transition hover:opacity-90 ${
                accent === "coral" ? "bg-coral" : "bg-skyblue"
              }`}
            >
              We did it! ✅
            </button>
            <button
              onClick={() => resolve("skipped")}
              className="w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
            >
              Skip this one 🙈
            </button>
          </div>

          {userId && (
            <CommentThread
              surpriseId={current.id}
              userId={userId}
              friendName={friendName}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-wide text-mute">
            Nothing active
          </p>
          <h1 className="font-serif mt-3 text-2xl font-semibold">
            {isDareMode ? "Ready for a dare?" : "Ready for a surprise?"}
          </h1>
          <button
            onClick={drawNew}
            disabled={drawing}
            className={`mt-8 w-full rounded-full py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50 ${
              accent === "coral" ? "bg-coral" : "bg-skyblue"
            }`}
          >
            {drawing ? "..." : isDareMode ? "Dare us" : "Surprise us"}
          </button>
        </div>
      )}
      {error && <p className="mt-4 text-center text-sm text-coral">{error}</p>}
    </div>
  );
}

