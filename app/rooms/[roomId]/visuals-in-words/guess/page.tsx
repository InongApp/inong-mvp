"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoomSession } from "@/lib/useRoomSession";
import { getLatestRound, startNextRound, roundTypeInfo, RoundRow } from "@/lib/rounds";
import { notify } from "@/lib/notifyClient";
import CommentThread from "@/components/CommentThread";

const QUESTIONS_PER_ROUND = 6; // 3 presented by each player

type Experience = {
  id: string;
  question: string;
  clue_1: string | null;
  clue_2: string | null;
  correct_answer: string | null;
  clues_revealed: number;
  created_by: string;
};

type GuessResult = {
  correct: boolean;
  points: number;
  guess_answer: string;
  clues_used: number;
};

export default function GuessThePicturePage() {
  const router = useRouter();
  const { userId, roomId, friendId, friendName, ready } = useRoomSession();

  const [round, setRound] = useState<RoundRow | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [friendScore, setFriendScore] = useState(0);
  const [startingNext, setStartingNext] = useState(false);
  const [roundQuestionCount, setRoundQuestionCount] = useState(0);

  const [experience, setExperience] = useState<Experience | null>(null);
  const [result, setResult] = useState<GuessResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [askMode, setAskMode] = useState<"custom" | null>(null);
  const [customClue1, setCustomClue1] = useState("");
  const [customClue2, setCustomClue2] = useState("");
  const [customAnswer, setCustomAnswer] = useState("");
  const [guessText, setGuessText] = useState("");
  const [resolving, setResolving] = useState(false);
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

    const { data: scores } = await supabase
      .from("guess_scores")
      .select("profile_id, points")
      .eq("room_id", roomId);
    setMyScore((scores ?? []).find((s: any) => s.profile_id === userId)?.points ?? 0);
    setFriendScore((scores ?? []).find((s: any) => s.profile_id !== userId)?.points ?? 0);

    const latest = await getLatestRound(roomId, "visuals_guess" as any);

    if (latest && latest.status === "complete") {
      setRound(latest);
      setLoading(false);
      return;
    }

    setRound(latest);

    if (!latest) {
      setExperience(null);
      setResult(null);
      setLoading(false);
      return;
    }

    const { data: experiences } = await supabase
      .from("experiences")
      .select("id, question, clue_1, clue_2, correct_answer, clues_revealed, created_by")
      .eq("round_id", latest.id)
      .order("created_at", { ascending: true });

    setRoundQuestionCount((experiences ?? []).length);

    const last = (experiences ?? [])[
      (experiences ?? []).length - 1
    ] as Experience | undefined;

    if (!last) {
      setExperience(null);
      setResult(null);
      setLoading(false);
      return;
    }

    setExperience(last);

    const { data: guessResult } = await supabase
      .from("guess_results")
      .select("correct, points, guess_answer, clues_used")
      .eq("experience_id", last.id)
      .maybeSingle();
    setResult((guessResult as GuessResult) ?? null);

    // Check if the round just filled up
    if (guessResult) {
      const { data: allExps } = await supabase
        .from("experiences")
        .select("id")
        .eq("round_id", latest.id);
      const expIds = (allExps ?? []).map((e: any) => e.id);
      const { count } = await supabase
        .from("guess_results")
        .select("id", { count: "exact", head: true })
        .in("experience_id", expIds);
      if ((count ?? 0) >= QUESTIONS_PER_ROUND) {
        await supabase
          .from("experience_rounds")
          .update({ status: "complete", completed_at: new Date().toISOString() })
          .eq("id", latest.id)
          .eq("status", "active");
      }
    }

    setLoading(false);
  }

  async function ensureActiveRound(): Promise<RoundRow> {
    if (round && round.status === "active") return round;
    const created = await startNextRound(roomId!, "visuals_guess" as any);
    setRound(created);
    return created;
  }

  async function createRiddle(clue1: string, clue2: string, answer: string) {
    if (!roomId || !userId) return;
    const activeRound = await ensureActiveRound();
    const { error: insertErr } = await supabase.from("experiences").insert({
      room_id: roomId,
      round_id: activeRound.id,
      type: "visuals_guess",
      question: "What am I looking at?",
      clue_1: clue1,
      clue_2: clue2,
      correct_answer: answer,
      clues_revealed: 1,
      created_by: userId,
    });
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    if (friendId) {
      notify(
        friendId,
        "New riddle in Guess the Picture 🕵️",
        clue1,
        `/rooms/${roomId}/visuals-in-words/guess`
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
        .select("correct_answer")
        .eq("room_id", roomId)
        .eq("type", "visuals_guess");
      const used = (existing ?? []).map((e: any) => e.correct_answer).filter(Boolean);

      const res = await fetch("/api/generate-riddle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, usedAnswers: used }),
      });
      const data = await res.json();
      if (!data.clue1) {
        setError("Couldn't come up with a riddle right now — try again in a moment.");
        return;
      }
      await createRiddle(data.clue1, data.clue2, data.answer);
    } finally {
      setAsking(false);
    }
  }

  async function submitCustomRiddle() {
    if (!customClue1.trim() || !customClue2.trim() || !customAnswer.trim()) {
      return setError("Fill in both clues and the answer.");
    }
    setError(null);
    await createRiddle(customClue1.trim(), customClue2.trim(), customAnswer.trim());
    setCustomClue1("");
    setCustomClue2("");
    setCustomAnswer("");
    setAskMode(null);
  }

  async function requestClue2() {
    if (!experience) return;
    await supabase
      .from("experiences")
      .update({ clues_revealed: 2 })
      .eq("id", experience.id);
    load();
  }

  async function submitGuess() {
    if (!experience || !userId || !guessText.trim()) return;
    setResolving(true);
    setError(null);
    try {
      const res = await fetch("/api/resolve-guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: experience.id,
          roomId,
          guesserProfileId: userId,
          guessAnswer: guessText.trim(),
          cluesUsed: experience.clues_revealed,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGuessText("");
      load();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setResolving(false);
    }
  }

  if (!ready || loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading your Inong...
      </div>
    );
  }

  const typeInfo = round ? roundTypeInfo(round.round_type) : null;

  if (round && round.status === "complete") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-coral text-3xl">
          🕵️
        </div>
        <p className="text-sm uppercase tracking-wide text-mute">
          Round {round.round_number} complete
        </p>
        <p className="font-serif mt-2 text-2xl font-semibold text-coral">
          You: {myScore} · {friendName}: {friendScore}
        </p>
        <p className="mt-8 text-sm text-mute">
          Ready when {friendName} is for round {round.round_number + 1}.
        </p>
        <button
          onClick={async () => {
            setStartingNext(true);
            try {
              await startNextRound(roomId!, "visuals_guess" as any);
              await load();
            } catch (e: any) {
              setError(e.message ?? "Couldn't start the next round.");
            } finally {
              setStartingNext(false);
            }
          }}
          disabled={startingNext}
          className="mt-4 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {startingNext ? "..." : `Start round ${round.round_number + 1}`}
        </button>
      </div>
    );
  }

  const scoreboard = (
    <div className="mb-4 rounded-card bg-surface px-4 py-2 text-xs text-mute">
      <div className="flex items-center justify-between">
        <span>
          {round ? `Round ${round.round_number}` : "Round 1"} · Q
          {Math.min(roundQuestionCount, QUESTIONS_PER_ROUND)}/{QUESTIONS_PER_ROUND}
        </span>
        <button
          onClick={() => router.push(`/rooms/${roomId}/history`)}
          className="text-coral hover:underline"
        >
          History
        </button>
      </div>
      <p className="mt-1">
        You: {myScore} · {friendName}: {friendScore}
      </p>
    </div>
  );

  const isPresenter = experience ? experience.created_by === userId : false;
  const isMyTurnToPresent = !experience || (!!result && !isPresenter);

  // ---------- Resolved: show the outcome ----------
  if (experience && result) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div
            className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full text-3xl ${
              result.correct ? "bg-coral" : "bg-surface"
            }`}
          >
            {result.correct ? "🎯" : "😂"}
          </div>
          <h1 className="font-serif text-2xl font-semibold">
            {result.correct ? "Correct!" : "Not quite."}
          </h1>
          <p className="font-serif mt-2 text-2xl font-semibold text-coral">
            {result.points > 0 ? `+${result.points}` : "0"} points
          </p>
          <div className="mt-6 w-full space-y-2 text-left">
            <div className="rounded-card bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-mute">
                The answer was
              </p>
              <p className="mt-1 text-paper">{experience.correct_answer}</p>
            </div>
            <div className="rounded-card bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-mute">
                Guessed after {result.clues_used} clue{result.clues_used > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-paper">{result.guess_answer}</p>
            </div>
          </div>
        </div>
        <CommentThread
          experienceId={experience.id}
          userId={userId!}
          friendName={friendName}
        />
        {isMyTurnToPresent ? (
          <button
            onClick={createFromBank}
            disabled={asking}
            className="mt-6 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
          >
            {asking ? "Thinking of one..." : "Present the next riddle"}
          </button>
        ) : (
          <p className="mt-6 text-center text-sm text-mute">
            Waiting for {friendName} to present the next riddle.
          </p>
        )}
        {error && <p className="mt-4 text-center text-sm text-coral">{error}</p>}
      </div>
    );
  }

  // ---------- No active riddle, my turn to present ----------
  if (isMyTurnToPresent) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        {askMode === "custom" ? (
          <div className="flex flex-col">
            <button
              onClick={() => setAskMode(null)}
              className="self-start text-sm text-mute hover:text-paper"
            >
              ← Back
            </button>
            <h2 className="font-serif mt-4 text-xl font-semibold">
              Set up your riddle
            </h2>
            <label className="mt-4 text-xs uppercase tracking-wide text-mute">
              Clue 1 (vague)
            </label>
            <input
              value={customClue1}
              onChange={(e) => setCustomClue1(e.target.value)}
              className="mt-1 rounded-card bg-surface px-4 py-3 text-paper focus:outline-none focus:ring-2 focus:ring-coral"
            />
            <label className="mt-4 text-xs uppercase tracking-wide text-mute">
              Clue 2 (more specific)
            </label>
            <input
              value={customClue2}
              onChange={(e) => setCustomClue2(e.target.value)}
              className="mt-1 rounded-card bg-surface px-4 py-3 text-paper focus:outline-none focus:ring-2 focus:ring-coral"
            />
            <label className="mt-4 text-xs uppercase tracking-wide text-mute">
              The answer
            </label>
            <input
              value={customAnswer}
              onChange={(e) => setCustomAnswer(e.target.value)}
              className="mt-1 rounded-card bg-surface px-4 py-3 text-paper focus:outline-none focus:ring-2 focus:ring-coral"
            />
            <button
              onClick={submitCustomRiddle}
              className="mt-6 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
            >
              Send riddle
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
              Your turn to present
            </p>
            <h1 className="font-serif mt-3 text-2xl font-semibold">
              Give {friendName} something to guess
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
                Set up your own riddle
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
      </div>
    );
  }

  // ---------- Active riddle ----------
  if (isPresenter) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-wide text-mute">
            {friendName} is guessing
          </p>
          <p className="mt-4 max-w-xs text-mute">
            Clue {experience!.clues_revealed} is showing. Sit tight.
          </p>
        </div>
      </div>
    );
  }

  // I'm the guesser
  return (
    <div className="flex flex-1 flex-col">
      {scoreboard}
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-sm uppercase tracking-wide text-mute">
          What am I looking at?
        </p>
        <div className="mt-4 space-y-3">
          <div className="rounded-card bg-surface px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-mute">Clue 1</p>
            <p className="mt-1 text-paper">{experience!.clue_1}</p>
          </div>
          {experience!.clues_revealed === 2 && (
            <div className="rounded-card bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-mute">Clue 2</p>
              <p className="mt-1 text-paper">{experience!.clue_2}</p>
            </div>
          )}
        </div>

        <input
          value={guessText}
          onChange={(e) => setGuessText(e.target.value)}
          placeholder="Your guess..."
          className="mt-6 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
        />

        <button
          onClick={submitGuess}
          disabled={!guessText.trim() || resolving}
          className="mt-4 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {resolving
            ? "..."
            : experience!.clues_revealed === 1
            ? "I know it! (worth 3 points)"
            : "Final answer (worth 1 point)"}
        </button>

        {experience!.clues_revealed === 1 && (
          <button
            onClick={requestClue2}
            className="mt-3 w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
          >
            Give me clue 2 (drops to 1 point)
          </button>
        )}

        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
      </div>
    </div>
  );
}

