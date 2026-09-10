"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoomSession } from "@/lib/useRoomSession";
import { notify } from "@/lib/notifyClient";

function todayLocalDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function timeRemaining(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m left`;
}

type DailyPrompt = {
  id: string;
  question: string;
  expires_at: string;
};

export default function Daily24Page() {
  const router = useRouter();
  const { userId, roomId, friendId, friendName, ready } = useRoomSession();

  const [prompt, setPrompt] = useState<DailyPrompt | null>(null);
  const [myAnswer, setMyAnswer] = useState<string | null>(null);
  const [friendAnswer, setFriendAnswer] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!ready || !roomId || !userId) return;
    load();
    const interval = setInterval(load, 5000);
    const tick = setInterval(() => forceTick((n) => n + 1), 30000); // refresh countdown text
    return () => {
      clearInterval(interval);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, roomId, userId]);

  async function load() {
    if (!roomId || !userId) return;
    const today = todayLocalDate();

    let { data: existing } = await supabase
      .from("daily_prompts")
      .select("id, question, expires_at")
      .eq("room_id", roomId)
      .eq("prompt_date", today)
      .maybeSingle();

    if (!existing) {
      setGenerating(true);
      try {
        const res = await fetch("/api/generate-daily-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });
        const data = await res.json();
        if (data.question) {
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          const { data: created, error: insertErr } = await supabase
            .from("daily_prompts")
            .insert({
              room_id: roomId,
              prompt_date: today,
              question: data.question,
              expires_at: expiresAt,
            })
            .select("id, question, expires_at")
            .maybeSingle();
          if (!insertErr && created) {
            existing = created;
            if (friendId) {
              notify(
                friendId,
                "Today's INONG 24 is here ⏳",
                data.question,
                `/rooms/${roomId}/daily`
              );
            }
          } else {
            // Someone else generated it in the same instant — fetch theirs
            const { data: raceWinner } = await supabase
              .from("daily_prompts")
              .select("id, question, expires_at")
              .eq("room_id", roomId)
              .eq("prompt_date", today)
              .maybeSingle();
            existing = raceWinner ?? null;
          }
        }
      } finally {
        setGenerating(false);
      }
    }

    if (!existing) {
      setPrompt(null);
      setLoading(false);
      return;
    }

    setPrompt(existing as DailyPrompt);

    const { data: responses } = await supabase
      .from("daily_responses")
      .select("profile_id, answer")
      .eq("daily_prompt_id", (existing as DailyPrompt).id);

    setMyAnswer((responses ?? []).find((r: any) => r.profile_id === userId)?.answer ?? null);
    setFriendAnswer(
      (responses ?? []).find((r: any) => r.profile_id !== userId)?.answer ?? null
    );

    setLoading(false);
  }

  async function submitAnswer() {
    if (!prompt || !userId || !freeText.trim()) return;
    const { error: insertErr } = await supabase.from("daily_responses").insert({
      daily_prompt_id: prompt.id,
      profile_id: userId,
      answer: freeText.trim(),
    });
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setFreeText("");
    load();
  }

  if (!ready || loading || generating) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        {generating ? "Preparing today's question..." : "Loading..."}
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Couldn&rsquo;t load today&rsquo;s question — try again in a moment.
      </div>
    );
  }

  const remaining = timeRemaining(prompt.expires_at);
  const expired = !remaining;
  const bothAnswered = !!myAnswer && !!friendAnswer;

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => router.back()}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← Back
      </button>

      <div className="mb-4 mt-4 rounded-card bg-surface px-4 py-2 text-center text-xs text-mute">
        {expired ? "This one has expired" : `⏳ ${remaining}`}
      </div>

      {bothAnswered ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-wide text-mute">Today&rsquo;s question</p>
          <h1 className="font-serif mt-2 text-xl font-semibold leading-snug">
            {prompt.question}
          </h1>
          <div className="mt-8 w-full space-y-3 text-left">
            <div className="rounded-card bg-surface px-5 py-4">
              <p className="text-xs uppercase tracking-wide text-mute">You said</p>
              <p className="mt-1 text-paper">{myAnswer}</p>
            </div>
            <div className="rounded-card bg-surface px-5 py-4">
              <p className="text-xs uppercase tracking-wide text-mute">
                {friendName} said
              </p>
              <p className="mt-1 text-paper">{friendAnswer}</p>
            </div>
          </div>
          <p className="mt-6 text-sm text-mute">Back tomorrow for a new one.</p>
        </div>
      ) : myAnswer ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-wide text-mute">Answered</p>
          <p className="mt-4 max-w-xs text-mute">
            {expired
              ? `Time ran out before ${friendName} answered — this one's gone.`
              : `Waiting on ${friendName}, before time runs out.`}
          </p>
        </div>
      ) : expired ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-wide text-mute">Missed it</p>
          <p className="mt-4 max-w-xs text-mute">
            Today&rsquo;s question expired. A new one shows up tomorrow.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-sm uppercase tracking-wide text-mute">
            Today&rsquo;s question
          </p>
          <h1 className="font-serif mt-3 text-2xl font-semibold leading-snug">
            {prompt.question}
          </h1>
          <div className="mt-8">
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Your answer..."
              rows={3}
              className="w-full rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
            />
            <button
              onClick={submitAnswer}
              disabled={!freeText.trim()}
              className="mt-4 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
            >
              Answer
            </button>
          </div>
          {error && <p className="mt-4 text-sm text-coral">{error}</p>}
        </div>
      )}
    </div>
  );
}

