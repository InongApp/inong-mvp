"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoomSession } from "@/lib/useRoomSession";
import {
  getLatestRound,
  startNextRound,
  completeRoundIfFull,
  roundTypeInfo,
  RoundRow,
} from "@/lib/rounds";
import { notify } from "@/lib/notifyClient";
import CommentThread from "@/components/CommentThread";
import WordPictureReveal from "@/components/WordPictureReveal";
import WordsRoundRecap from "@/components/WordsRoundRecap";

// Visuals in Words has its own mechanic, deliberately unlike Know Me/Bet on
// Me: nobody predicts anybody. Both people respond to the SAME evocative
// prompt with their own imagery — the comparison itself is the point, not
// a right answer. Whoever introduces the prompt still takes turns, but
// they also respond themselves, since there's no separate "asker" role.
//
// V1 is text-only by design (see product discussion) — this experience is
// meant to gain real AI-generated images later for premium, without
// changing its identity or URL. No discovery extraction in V1: a single
// discovery per experience is already claimed by the Discover/Deepen flow
// in Know Me/Bet on Me, and this experience has two equally personal
// responses rather than one clear subject.

type Experience = {
  id: string;
  question: string;
  created_by: string;
};

export default function VisualsInWordsPage() {
  const router = useRouter();
  const { userId, roomId, friendId, friendName, ready } = useRoomSession();

  const [round, setRound] = useState<RoundRow | null>(null);
  const [startingNext, setStartingNext] = useState(false);

  const [experience, setExperience] = useState<Experience | null>(null);
  const [myAnswer, setMyAnswer] = useState<string | null>(null);
  const [friendAnswer, setFriendAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [askMode, setAskMode] = useState<"custom" | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [freeText, setFreeText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !roomId || !userId) return;
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, roomId, userId]);

  async function load() {
    if (!roomId || !userId) return;

    const latest = await getLatestRound(roomId, "visuals_in_words" as any);

    if (latest && latest.status === "complete") {
      setRound(latest);
      setLoading(false);
      return;
    }

    setRound(latest);

    if (!latest) {
      setExperience(null);
      setMyAnswer(null);
      setFriendAnswer(null);
      setLoading(false);
      return;
    }

    const { data: experiences } = await supabase
      .from("experiences")
      .select("id, question, created_by")
      .eq("round_id", latest.id)
      .order("created_at", { ascending: true });

    const last = (experiences ?? [])[
      (experiences ?? []).length - 1
    ] as Experience | undefined;

    if (!last) {
      setExperience(null);
      setMyAnswer(null);
      setFriendAnswer(null);
      setLoading(false);
      return;
    }

    setExperience(last);

    const { data: responses } = await supabase
      .from("responses")
      .select("profile_id, answer")
      .eq("experience_id", last.id);

    const mine = (responses ?? []).find((r: any) => r.profile_id === userId);
    const theirs = (responses ?? []).find((r: any) => r.profile_id !== userId);
    setMyAnswer(mine?.answer ?? null);
    setFriendAnswer(theirs?.answer ?? null);

    if (mine && theirs) {
      await completeRoundIfFull(latest.id);
    }

    setLoading(false);
  }

  async function ensureActiveRound(): Promise<RoundRow> {
    if (round && round.status === "active") return round;
    const created = await startNextRound(roomId!, "visuals_in_words" as any);
    setRound(created);
    return created;
  }

  async function createPrompt(promptText: string) {
    if (!roomId || !userId) return;
    const activeRound = await ensureActiveRound();
    const { error: insertErr } = await supabase.from("experiences").insert({
      room_id: roomId,
      round_id: activeRound.id,
      type: "visuals_in_words",
      question: promptText,
      options: null,
      created_by: userId,
    });
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    if (friendId) {
      notify(
        friendId,
        "New prompt in Visuals in Words 🎨",
        promptText,
        `/rooms/${roomId}/visuals-in-words`
      );
    }
    load();
  }

  async function createFromBank() {
    if (!roomId) return;
    setError(null);
    setAsking(true);
    try {
      const { data: existing } = await supabase
        .from("experiences")
        .select("question")
        .eq("room_id", roomId)
        .eq("type", "visuals_in_words");
      const used = (existing ?? []).map((e: any) => e.question);

      const activeRound = round ?? (await ensureActiveRound());
      const res = await fetch("/api/generate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "visuals_in_words",
          usedQuestions: used,
          askerName: "you",
          subjectName: friendName,
          roomId,
          roundType: activeRound.round_type,
        }),
      });
      const data = await res.json();
      if (!data.question) {
        setError("Couldn't come up with a prompt right now — try again in a moment.");
        return;
      }
      await createPrompt(data.question);
    } finally {
      setAsking(false);
    }
  }

  async function submitCustomPrompt() {
    if (!customPrompt.trim()) return setError("Write a prompt first.");
    setError(null);
    await createPrompt(customPrompt.trim());
    setCustomPrompt("");
    setAskMode(null);
  }

  async function submitAnswer() {
    if (!experience || !userId || !freeText.trim()) return;
    await supabase.from("responses").insert({
      experience_id: experience.id,
      profile_id: userId,
      answer: freeText.trim(),
      is_prediction: false,
    });
    setFreeText("");
    load();
  }

  if (!ready || loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading your Inong...
      </div>
    );
  }

  const isComplete = !!myAnswer && !!friendAnswer;
  const typeInfo = round ? roundTypeInfo(round.round_type) : null;

  if (round && round.status === "complete") {
    return (
      <WordsRoundRecap
        roundNumber={round.round_number}
        typeLabel={typeInfo?.label}
        friendName={friendName}
        onStartNext={async () => {
          setStartingNext(true);
          try {
            await startNextRound(roomId!, "visuals_in_words" as any);
            await load();
          } catch (e: any) {
            setError(e.message ?? "Couldn't start the next round.");
          } finally {
            setStartingNext(false);
          }
        }}
        starting={startingNext}
      />
    );
  }

  const scoreboard = (
    <div className="mb-4 rounded-card bg-surface px-4 py-2 text-xs text-mute">
      <div className="flex items-center justify-between">
        <span>
          {round ? `Round ${round.round_number}` : "Round 1"}
          {typeInfo ? ` — ${typeInfo.label}` : ""} · 5 prompts each
        </span>
        <button
          onClick={() => router.push(`/rooms/${roomId}/history`)}
          className="text-coral hover:underline"
        >
          History
        </button>
      </div>
      {typeInfo && <p className="mt-1">{typeInfo.description}</p>}
    </div>
  );

  const isMyTurn =
    !experience || (isComplete && experience.created_by !== userId);

  // ---------- No active prompt, my turn to introduce one ----------
  if ((!experience || isComplete) && isMyTurn) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        {isComplete && experience && (
          <>
            <WordPictureReveal
              prompt={experience.question}
              myDescription={myAnswer!}
              friendDescription={friendAnswer!}
              friendName={friendName}
            />
            <CommentThread
              experienceId={experience.id}
              userId={userId!}
              friendName={friendName}
            />
            <div className="my-6 border-t border-surface" />
          </>
        )}

        {askMode === "custom" ? (
          <div className="flex flex-col">
            <button
              onClick={() => setAskMode(null)}
              className="self-start text-sm text-mute hover:text-paper"
            >
              ← Back
            </button>
            <h2 className="font-serif mt-4 text-xl font-semibold">
              Write your own prompt
            </h2>
            <p className="mt-2 text-sm text-mute">
              Ask for an image, scene, or feeling — not a fact. e.g. "What
              does peace look like to you?"
            </p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Describe what..."
              rows={3}
              className="mt-4 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
            />
            <button
              onClick={submitCustomPrompt}
              className="mt-6 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
            >
              Send prompt
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            {typeInfo && (
              <div className="mb-4 rounded-card bg-coral/10 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-coral">
                  {typeInfo.label} round
                </p>
                <p className="mt-1 text-sm text-paper">{typeInfo.description}</p>
              </div>
            )}
            <p className="text-sm uppercase tracking-wide text-mute">
              Your turn
            </p>
            <h1 className="font-serif mt-3 text-2xl font-semibold">
              Give {friendName} something to picture
            </h1>
            <div className="mt-8 w-full space-y-3">
              <button
                onClick={createFromBank}
                disabled={asking}
                className="w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
              >
                {asking ? "Thinking of one..." : "Play"}
              </button>
              <button
                onClick={() => setAskMode("custom")}
                className="w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
              >
                Write your own prompt
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
      </div>
    );
  }

  // ---------- Round just finished, waiting on their next prompt ----------
  if (isComplete && !isMyTurn) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        <WordPictureReveal
          prompt={experience!.question}
          myDescription={myAnswer!}
          friendDescription={friendAnswer!}
          friendName={friendName}
        />
        <CommentThread
          experienceId={experience!.id}
          userId={userId!}
          friendName={friendName}
        />
        <p className="mt-6 text-center text-sm text-mute">
          Waiting for {friendName} to send the next prompt.
        </p>
      </div>
    );
  }

  // ---------- Active prompt: I still need to respond ----------
  if (myAnswer) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-wide text-mute">
            Waiting on {friendName}
          </p>
          <p className="mt-4 max-w-xs text-mute">
            You&rsquo;ve shared what you pictured. We&rsquo;ll reveal both as soon
            as they answer too.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {scoreboard}
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-sm uppercase tracking-wide text-mute">
          Describe what you picture
        </p>
        <h1 className="font-serif mt-3 text-2xl font-semibold leading-snug">
          {experience!.question}
        </h1>
        <div className="mt-8">
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="In your own words..."
            rows={4}
            className="w-full rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
          />
          <button
            onClick={submitAnswer}
            disabled={!freeText.trim()}
            className="mt-4 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
          >
            Share it
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
      </div>
    </div>
  );
}

