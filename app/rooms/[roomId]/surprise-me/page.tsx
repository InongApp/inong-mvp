"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { randomChallenge } from "@/lib/challenges";

type Surprise = {
  id: string;
  prompt: string;
  category: string;
  status: "active" | "done" | "skipped";
};

export default function SurpriseMePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [current, setCurrent] = useState<Surprise | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
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
    setUserId(session.user.id);

    const { data: all } = await supabase
      .from("surprises")
      .select("id, prompt, category, status")
      .eq("room_id", params.roomId)
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
        .eq("room_id", params.roomId);
      const used = (all ?? []).map((s: any) => s.prompt);

      const challenge = randomChallenge(used);
      if (!challenge) {
        setError("Couldn't draw one — try again.");
        return;
      }

      const { error: insertErr } = await supabase.from("surprises").insert({
        room_id: params.roomId,
        prompt: challenge.prompt,
        category: challenge.category,
        created_by: userId,
      });
      if (insertErr) {
        setError(insertErr.message);
        return;
      }
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
    load();
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
        onClick={() => router.back()}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← Back
      </button>

      <div className="mb-4 mt-4 rounded-card bg-surface px-4 py-2 text-xs text-mute">
        {doneCount} challenge{doneCount !== 1 ? "s" : ""} done together
      </div>

      {current ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-coral text-3xl">
            🎁
          </div>
          <p className="text-sm uppercase tracking-wide text-mute">
            Surprise
          </p>
          <h1 className="font-serif mt-3 text-2xl font-semibold leading-snug">
            {current.prompt}
          </h1>

          <div className="mt-10 w-full space-y-3">
            <button
              onClick={() => resolve("done")}
              className="w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
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
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-wide text-mute">
            Nothing active
          </p>
          <h1 className="font-serif mt-3 text-2xl font-semibold">
            Ready for a surprise?
          </h1>
          <button
            onClick={drawNew}
            disabled={drawing}
            className="mt-8 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
          >
            {drawing ? "..." : "Surprise us"}
          </button>
        </div>
      )}
      {error && <p className="mt-4 text-center text-sm text-coral">{error}</p>}
    </div>
  );
}

