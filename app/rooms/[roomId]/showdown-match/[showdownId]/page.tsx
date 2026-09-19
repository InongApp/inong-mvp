"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { leagueLabel } from "@/lib/leagues";
import { getShowdown, getShowdownQuestions, Showdown, ShowdownQuestion } from "@/lib/showdowns";
import {
  QUESTION_TIMEOUT_MINUTES,
  getOrInitProgress,
  isTimedOut,
  submitAnswer,
  getResponsesForQuestion,
  tryAdvance,
  forfeitByTimeout,
  ShowdownProgress,
} from "@/lib/showdownPlay";

export default function ShowdownMatchPage() {
  const params = useParams<{ roomId: string; showdownId: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [showdown, setShowdown] = useState<Showdown | null>(null);
  const [questions, setQuestions] = useState<ShowdownQuestion[]>([]);
  const [progress, setProgress] = useState<ShowdownProgress | null>(null);
  const [myAnswered, setMyAnswered] = useState(false);
  const [partnerAnswered, setPartnerAnswered] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    load();
    const interval = setInterval(load, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live countdown ticks every second between polls, purely visual —
  // the actual timeout check happens against the server timestamp in load().
  useEffect(() => {
    if (!progress || showdown?.status !== "active") return;
    const tick = () => {
      const startedAt = new Date(progress.question_started_at).getTime();
      const elapsed = (Date.now() - startedAt) / 1000;
      setSecondsLeft(Math.max(0, Math.round(QUESTION_TIMEOUT_MINUTES * 60 - elapsed)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [progress, showdown?.status]);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace("/login");
      return;
    }
    setUserId(session.user.id);

    const found = await getShowdown(params.showdownId);
    if (!found) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setShowdown(found);

    const qs = await getShowdownQuestions(params.showdownId);
    setQuestions(qs);

    if (found.status !== "active") {
      setLoading(false);
      return; // result screen renders below from `found`, nothing left to poll for
    }

    const prog = await getOrInitProgress(params.showdownId, params.roomId);

    if (isTimedOut(prog)) {
      await forfeitByTimeout(params.showdownId, params.roomId);
      load(); // pick up the now-forfeited status immediately
      return;
    }

    setProgress(prog);

    if (!prog.completed_at) {
      const currentQ = qs.find((q) => q.question_number === prog.current_question_number);
      if (currentQ) {
        const responses = await getResponsesForQuestion(currentQ.id);
        setMyAnswered(responses.some((r) => r.profile_id === session.user.id));
        setPartnerAnswered(responses.length >= 2);
      }
    }

    setLoading(false);
  }

  async function handleAnswer(option: string) {
    if (!userId || !progress) return;
    const currentQ = questions.find((q) => q.question_number === progress.current_question_number);
    if (!currentQ) return;
    setSubmitting(true);
    try {
      await submitAnswer(currentQ.id, params.roomId, userId, option);
      await tryAdvance(params.showdownId, params.roomId, currentQ.id, questions.length);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading...
      </div>
    );
  }

  if (notFound || !showdown) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-mute">This Showdown doesn&rsquo;t exist.</p>
        <button
          onClick={() => router.push(`/rooms/${params.roomId}`)}
          className="mt-6 rounded-full bg-coral px-6 py-3 font-medium text-ink transition hover:opacity-90"
        >
          Back to room
        </button>
      </div>
    );
  }

  // ---------- Result screen (complete, forfeited, or abandoned) ----------
  if (showdown.status !== "active") {
    const iWon = showdown.winner_room_id === params.roomId;
    const isTie = showdown.status === "complete" && !showdown.winner_room_id;
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-coral text-3xl">
          {isTie ? "🤝" : iWon ? "🏆" : "💭"}
        </div>
        <h1 className="font-serif text-2xl font-semibold">
          {isTie ? "It's a tie!" : iWon ? "You won!" : "Good match"}
        </h1>
        <p className="mt-2 max-w-xs text-sm text-mute">
          {showdown.status === "forfeited" &&
            (iWon
              ? "The other Pair didn't finish in time — the win is yours."
              : "Time ran out before your Pair finished this one.")}
          {isTie &&
            "You both matched exactly the same number of questions. Automatic tie-breakers aren't built yet — call it a draw for now."}
          {showdown.status === "complete" &&
            !isTie &&
            (iWon
              ? "You matched each other more closely than the other Pair did."
              : "The other Pair matched each other more closely this time.")}
        </p>
        <button
          onClick={() => router.push(`/rooms/${params.roomId}`)}
          className="mt-8 rounded-full bg-coral px-6 py-3 font-medium text-ink transition hover:opacity-90"
        >
          Back to room
        </button>
      </div>
    );
  }

  // ---------- Waiting for the other Pair to finish ----------
  if (progress?.completed_at) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-sm uppercase tracking-wide text-mute">All done!</p>
        <h1 className="font-serif mt-2 text-xl font-semibold">
          Waiting on the other Pair to finish
        </h1>
        <p className="mt-2 text-sm text-mute">
          You matched {progress.match_count} of {questions.length}.
        </p>
      </div>
    );
  }

  // ---------- Live question ----------
  const currentQ = questions.find((q) => q.question_number === progress?.current_question_number);
  if (!currentQ) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading question...
      </div>
    );
  }

  const minutes = secondsLeft != null ? Math.floor(secondsLeft / 60) : 0;
  const seconds = secondsLeft != null ? secondsLeft % 60 : 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-xs uppercase tracking-wide text-mute">
        {leagueLabel(showdown.league_key)} League · Question {currentQ.question_number} of{" "}
        {questions.length}
      </p>
      <p
        className={`mt-2 text-2xl font-mono ${
          secondsLeft != null && secondsLeft < 60 ? "text-coral" : "text-paper"
        }`}
      >
        {minutes}:{String(seconds).padStart(2, "0")}
      </p>

      <h1 className="font-serif mt-6 max-w-sm text-xl font-semibold leading-snug">
        {currentQ.question}
      </h1>

      {myAnswered ? (
        <p className="mt-8 text-sm text-mute">
          {partnerAnswered
            ? "Both answered — moving on..."
            : "Answer locked in. Waiting on your partner..."}
        </p>
      ) : (
        <div className="mt-8 w-full max-w-sm space-y-2">
          {currentQ.options.map((opt) => (
            <button
              key={opt}
              onClick={() => handleAnswer(opt)}
              disabled={submitting}
              className="w-full rounded-card border border-mute px-5 py-3 text-left text-paper transition hover:border-coral disabled:opacity-50"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

