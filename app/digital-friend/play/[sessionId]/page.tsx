"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import WagerSelector from "@/components/WagerSelector";
import { APP_PERSONAS } from "@/lib/digitalFriendPersonas";

const SESSION_LENGTH = 10;

type Session = {
  id: string;
  persona_key: string;
  persona_name: string;
  persona_traits: string;
  difficulty: string;
  mode: "know_me" | "bet_on_me";
};

type Round = {
  id: string;
  question: string;
  options: string[] | null;
  digital_answer: string;
  player_answer: string | null;
  points_wagered: number | null;
  resolved: boolean;
  correct: boolean | null;
  points_delta: number | null;
};

export default function DigitalFriendPlayPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [balance, setBalance] = useState(500);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [wager, setWager] = useState<number | null>(null);
  const [forcedWager, setForcedWager] = useState<number | null>(null);
  const [doublingUp, setDoublingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const {
      data: { session: authSession },
    } = await supabase.auth.getSession();
    if (!authSession?.user) {
      router.replace("/login");
      return;
    }
    setUserId(authSession.user.id);

    const { data: sess } = await supabase
      .from("digital_friend_sessions")
      .select("id, persona_key, persona_name, persona_traits, difficulty, mode")
      .eq("id", params.sessionId)
      .single();

    if (!sess) {
      setLoading(false);
      return;
    }
    setSession(sess as Session);

    const { data: existingRounds } = await supabase
      .from("digital_friend_rounds")
      .select(
        "id, question, options, digital_answer, player_answer, points_wagered, resolved, correct, points_delta"
      )
      .eq("session_id", params.sessionId)
      .order("created_at", { ascending: true });

    setRounds((existingRounds as Round[]) ?? []);

    if (sess.mode === "bet_on_me") {
      const { data: bal } = await supabase
        .from("digital_friend_balances")
        .select("points")
        .eq("profile_id", authSession.user.id)
        .eq("persona_key", sess.persona_key)
        .maybeSingle();
      setBalance(bal?.points ?? 500);
    }

    setLoading(false);
  }

  async function generateNextRound(forcedWagerAmount?: number) {
    if (!session || !userId) return;
    setGenerating(true);
    setError(null);
    try {
      const priorQA = rounds
        .filter((r) => r.resolved)
        .slice(-5)
        .map((r) => ({ question: r.question, answer: r.digital_answer }));

      const qRes = await fetch("/api/generate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: session.mode,
          usedQuestions: rounds.map((r) => r.question),
          askerName: "you",
          subjectName: session.persona_name,
          forceFormat: "choice",
        }),
      });
      const qData = await qRes.json();
      if (!qData.question || !qData.options) {
        setError("Couldn't generate a question — try again.");
        return;
      }

      const aRes = await fetch("/api/digital-friend/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traits: session.persona_traits,
          difficulty: session.difficulty,
          question: qData.question,
          options: qData.options,
          priorQA,
        }),
      });
      const aData = await aRes.json();
      if (!aData.answer) {
        setError("Couldn't get a response — try again.");
        return;
      }

      // Guard against the AI not reproducing an option verbatim (a real
      // risk with "must match exactly" instructions) — without this, the
      // stored answer could match nothing on screen, making the round
      // unwinnable no matter what the player picks.
      const options: string[] = qData.options;
      let finalAnswer = aData.answer as string;
      const exact = options.find((o) => o === finalAnswer);
      if (!exact) {
        const looseMatch = options.find(
          (o) => o.trim().toLowerCase() === finalAnswer.trim().toLowerCase()
        );
        finalAnswer = looseMatch ?? options[Math.floor(Math.random() * options.length)];
      }

      const { error: insertErr } = await supabase.from("digital_friend_rounds").insert({
        session_id: session.id,
        question: qData.question,
        options: qData.options,
        digital_answer: finalAnswer,
      });
      if (insertErr) {
        setError(insertErr.message);
        return;
      }

      if (forcedWagerAmount) {
        setForcedWager(forcedWagerAmount);
        setWager(forcedWagerAmount);
      }

      load();
    } finally {
      setGenerating(false);
    }
  }

  async function submitAnswer(currentRound: Round, chosen: string) {
    if (!userId || !session || submitting) return;
    setSubmitting(true);
    try {
      const correct = chosen === currentRound.digital_answer;
      const wagered = session.mode === "bet_on_me" ? wager : null;
      const delta =
        session.mode === "bet_on_me" && wagered
          ? correct
            ? wagered
            : -wagered
          : null;

      await supabase
        .from("digital_friend_rounds")
        .update({
          player_answer: chosen,
          points_wagered: wagered,
          resolved: true,
          correct,
          points_delta: delta,
        })
        .eq("id", currentRound.id);

      if (session.mode === "bet_on_me" && delta != null) {
        const newBalance = balance + delta;
        await supabase.from("digital_friend_balances").upsert(
          {
            profile_id: userId,
            persona_key: session.persona_key,
            points: newBalance,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id,persona_key" }
        );
        setBalance(newBalance);
      }

      setFreeText("");
      setWager(null);
      setForcedWager(null);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDoubleOrNothing(lastRound: Round) {
    if (!lastRound.points_delta) return;
    setDoublingUp(true);
    try {
      await generateNextRound(lastRound.points_delta);
    } finally {
      setDoublingUp(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-mute">Session not found.</p>
        <button
          onClick={() => router.push(`/digital-friend`)}
          className="mt-4 rounded-full bg-coral px-6 py-3 font-medium text-ink"
        >
          Start a new session
        </button>
      </div>
    );
  }

  const isBet = session.mode === "bet_on_me";
  const isPreset = APP_PERSONAS.some((p) => p.key === session.persona_key);
  const displayName = isPreset ? `Karabo (${session.persona_name})` : session.persona_name;
  const current = rounds[rounds.length - 1];
  const sessionDone = rounds.filter((r) => r.resolved).length >= SESSION_LENGTH;

  const scoreboard = (
    <div className="mb-4 rounded-card bg-surface px-4 py-2 text-xs text-mute">
      <p>
        🤖 {displayName} · {session.difficulty}
      </p>
      {isBet && <p className="mt-1">Balance: {balance} points</p>}
    </div>
  );

  // ---------- Session complete ----------
  if (sessionDone) {
    const resolved = rounds.filter((r) => r.resolved);
    const correctCount = resolved.filter((r) => r.correct).length;
    const netPoints = resolved.reduce((s, r) => s + (r.points_delta ?? 0), 0);
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div
          className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full text-3xl ${
            isBet ? "bg-skyblue" : "bg-coral"
          }`}
        >
          🤖
        </div>
        <p className="text-sm uppercase tracking-wide text-mute">
          That's a wrap with {displayName}
        </p>
        <p className="font-serif mt-2 text-2xl font-semibold">
          {isBet ? `${netPoints >= 0 ? "+" : ""}${netPoints} points` : `${correctCount}/${SESSION_LENGTH} correct`}
        </p>
        <p className="mt-3 max-w-xs text-mute">
          A fun read on {displayName} — not a verdict on how well you know
          your real Inong.
        </p>
        <button
          onClick={() => router.push(`/digital-friend`)}
          className="mt-8 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
        >
          Play again
        </button>
        <button
          onClick={() => router.push(`/`)}
          className="mt-3 w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
        >
          Back to Home
        </button>
      </div>
    );
  }

  // ---------- No round yet, or last one resolved: generate next ----------
  if (!current || current.resolved) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}

        {current?.resolved && (
          <div className="mb-6 flex flex-col items-center text-center">
            <div
              className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
                current.correct ? (isBet ? "bg-skyblue" : "bg-coral") : "bg-surface"
              }`}
            >
              {current.correct ? (isBet ? "🔥" : <span className="text-white">✓</span>) : "😂"}
            </div>
            <p className="text-sm text-mute">
              {displayName} said: <span className="text-paper">{current.digital_answer}</span>
            </p>
            <p className="mt-1 text-sm text-mute">
              You said: <span className="text-paper">{current.player_answer}</span>
            </p>
            {isBet && current.points_delta != null && (
              <p className={`mt-2 font-serif text-xl ${current.points_delta >= 0 ? "text-skyblue" : "text-coral"}`}>
                {current.points_delta >= 0 ? "+" : ""}
                {current.points_delta} points
              </p>
            )}
            {isBet && current.correct && current.points_delta ? (
              <button
                onClick={() => handleDoubleOrNothing(current)}
                disabled={doublingUp}
                className="mt-4 rounded-full bg-coral px-5 py-3 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-50"
              >
                {doublingUp ? "..." : `🎰 Double or nothing — risk ${current.points_delta}?`}
              </button>
            ) : null}
          </div>
        )}

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-wide text-mute">
            {rounds.length === 0 ? "Ready?" : `Question ${rounds.length + 1} of ${SESSION_LENGTH}`}
          </p>
          <button
            onClick={() => generateNextRound()}
            disabled={generating}
            className={`mt-6 w-full rounded-full py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50 ${
              isBet ? "bg-skyblue" : "bg-coral"
            }`}
          >
            {generating ? "Thinking..." : isBet ? "Get next scenario" : "Next question"}
          </button>
        </div>
        {error && <p className="mt-4 text-center text-sm text-coral">{error}</p>}
      </div>
    );
  }

  // ---------- Active round: answer it ----------
  return (
    <div className="flex flex-1 flex-col">
      {scoreboard}
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-sm uppercase tracking-wide text-mute">
          {isBet ? `Bet on ${displayName}` : `Guess ${displayName}'s answer`}
        </p>
        <h1 className="font-serif mt-3 text-2xl font-semibold leading-snug">
          {current.question}
        </h1>

        {isBet && (
          <div className="mt-6">
            {forcedWager ? (
              <div className="rounded-card bg-coral/10 px-4 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-coral">
                  Double or nothing
                </p>
                <p className="mt-1 text-sm text-paper">Wagering {forcedWager} points</p>
              </div>
            ) : (
              <WagerSelector balance={balance} value={wager} onChange={setWager} />
            )}
          </div>
        )}

        {current.options && (
          <div className="mt-6 space-y-3">
            {current.options.map((option) => (
              <button
                key={option}
                disabled={(isBet && !wager) || submitting}
                onClick={() => submitAnswer(current, option)}
                className={`w-full rounded-card border border-mute px-5 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  isBet ? "hover:border-skyblue hover:text-skyblue" : "hover:border-coral hover:text-coral"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        {isBet && !wager && (
          <p className="mt-3 text-center text-xs text-mute">Pick a wager amount above first.</p>
        )}

        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
      </div>
    </div>
  );
}

