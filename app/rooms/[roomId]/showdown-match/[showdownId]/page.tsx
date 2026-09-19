"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { leagueLabel } from "@/lib/leagues";
import { getShowdown, getShowdownQuestions, Showdown, ShowdownQuestion } from "@/lib/showdowns";

// This confirms the whole pipeline works end to end — challenge, ready,
// start, neutral question generation, match creation — but deliberately
// stops here. Actual gameplay (answering, the live per-question timer,
// scoring, forfeit handling) is a genuinely separate build step, not a
// small addition to this one, so this page is honest about not being
// that yet rather than faking a play screen that doesn't really work.
export default function ShowdownMatchPage() {
  const params = useParams<{ roomId: string; showdownId: string }>();
  const router = useRouter();
  const [showdown, setShowdown] = useState<Showdown | null>(null);
  const [questions, setQuestions] = useState<ShowdownQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const found = await getShowdown(params.showdownId);
    if (!found) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setShowdown(found);
    const qs = await getShowdownQuestions(params.showdownId);
    setQuestions(qs);
    setLoading(false);
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

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => router.push(`/rooms/${params.roomId}/compete`)}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← Back
      </button>

      <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-coral text-3xl">
          🏆
        </div>
        <h1 className="font-serif text-2xl font-semibold">Showdown created!</h1>
        <p className="mt-2 text-sm text-mute">
          {leagueLabel(showdown.league_key)} League · {questions.length} questions ready
        </p>

        <div className="mt-8 w-full max-w-sm space-y-2 text-left">
          {questions.map((q) => (
            <div key={q.id} className="rounded-card bg-surface px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-mute">
                Q{q.question_number} — {q.subject_side === "pair_a" ? "You're the subject" : "They're the subject"}
              </p>
              <p className="mt-1 text-sm text-paper">{q.question}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-xs text-sm text-mute">
          The full live match — answering, the timer, and the winner reveal
          — is the next thing to build. This page confirms the whole setup
          worked correctly.
        </p>
      </div>
    </div>
  );
}

