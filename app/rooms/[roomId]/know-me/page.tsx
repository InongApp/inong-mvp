"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { questionsByType } from "@/lib/questions";
import { useRoomSession } from "@/lib/useRoomSession";
import {
  getLatestRound,
  startNextRound,
  getRoundProgress,
  completeRoundIfFull,
  roundTypeInfo,
  RoundRow,
} from "@/lib/rounds";
import { resolveMatch } from "@/lib/matchJudge";
import { notify } from "@/lib/notifyClient";
import RevealCard from "@/components/RevealCard";
import CommentThread from "@/components/CommentThread";
import RoundRecap from "@/components/RoundRecap";

type Experience = {
  id: string;
  question: string;
  options: string[] | null;
  created_by: string;
  ai_matched: boolean | null;
};

type Discovery = { id: string; summary: string };

// Roles: the ASKER (created_by) predicts what the other person will say.
// The other member is the SUBJECT — they answer for themselves. Being the
// subject one round earns you the next turn to ask.
//
// Rounds: 5 turns per player (10 total) is the finite competitive unit —
// deliberate, not a limitation. When it fills, the round closes and shows
// a Recap. The Journey (all rounds over time) stays open-ended.

export default function KnowMePage() {
  const router = useRouter();
  const { userId, roomId, friendId, friendName, ready } = useRoomSession();

  const [round, setRound] = useState<RoundRow | null>(null);
  const [recapDiscoveries, setRecapDiscoveries] = useState<Discovery[]>([]);
  const [recapProgress, setRecapProgress] = useState({ completed: 0, matches: 0 });
  const [startingNext, setStartingNext] = useState(false);

  const [experience, setExperience] = useState<Experience | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [selfAnswer, setSelfAnswer] = useState<string | null>(null);
  const [predictionAnswer, setPredictionAnswer] = useState<string | null>(
    null
  );
  const [roundMatched, setRoundMatched] = useState<boolean | null>(null);
  const [matchedForId, setMatchedForId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [askMode, setAskMode] = useState<"custom" | null>(null);
  const [customQuestion, setCustomQuestion] = useState("");
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState("");
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

    const latest = await getLatestRound(roomId, "know_me");

    if (latest && latest.status === "complete") {
      setRound(latest);
      const progress = await getRoundProgress(latest.id);
      setRecapProgress(progress);

      const { data: exps } = await supabase
        .from("experiences")
        .select("id")
        .eq("round_id", latest.id);
      const expIds = (exps ?? []).map((e: any) => e.id);
      if (expIds.length > 0) {
        const { data: discoveries } = await supabase
          .from("discoveries")
          .select("id, summary")
          .in("source_experience_id", expIds);
        setRecapDiscoveries((discoveries as Discovery[]) ?? []);
      } else {
        setRecapDiscoveries([]);
      }

      setLoading(false);
      return;
    }

    setRound(latest);

    if (!latest) {
      setExperience(null);
      setIsComplete(false);
      setSelfAnswer(null);
      setPredictionAnswer(null);
      setLoading(false);
      return;
    }

    const { data: experiences } = await supabase
      .from("experiences")
      .select("id, question, options, created_by, ai_matched")
      .eq("round_id", latest.id)
      .order("created_at", { ascending: true });

    const last = (experiences ?? [])[
      (experiences ?? []).length - 1
    ] as Experience | undefined;

    if (!last) {
      setExperience(null);
      setIsComplete(false);
      setSelfAnswer(null);
      setPredictionAnswer(null);
    } else {
      const { data: responses } = await supabase
        .from("responses")
        .select("profile_id, answer, is_prediction")
        .eq("experience_id", last.id);

      const complete = (responses ?? []).length >= 2;
      setExperience(last);
      setIsComplete(complete);

      const mine = (responses ?? []).find((r) => r.profile_id === userId);
      const theirs = (responses ?? []).find((r) => r.profile_id !== userId);

      let self: string | null;
      let prediction: string | null;
      if (last.created_by === userId) {
        prediction = mine?.answer ?? null;
        self = theirs?.answer ?? null;
      } else {
        self = mine?.answer ?? null;
        prediction = theirs?.answer ?? null;
      }
      setSelfAnswer(self);
      setPredictionAnswer(prediction);

      if (complete && self && prediction && matchedForId !== last.id) {
        const matched = await resolveMatch(last, self, prediction);
        setRoundMatched(matched);
        setMatchedForId(last.id);

        // Only the subject's own browser triggers extraction — avoids both
        // people's clients firing the same call. The DB's unique constraint
        // on discoveries.source_experience_id is still the real safety net.
        const iAmSubject = last.created_by !== userId;
        if (iAmSubject) {
          fetch("/api/discoveries/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomId,
              experienceId: last.id,
              profileId: userId,
              question: last.question,
              answer: self,
            }),
          }).catch(() => {});
        }
      }
    }

    setLoading(false);
  }

  async function handleStartNextRound() {
    if (!roomId) return;
    setStartingNext(true);
    try {
      await startNextRound(roomId, "know_me");
      await load();
    } catch (e: any) {
      setError(e.message ?? "Couldn't start the next round.");
    } finally {
      setStartingNext(false);
    }
  }

  async function ensureActiveRound(): Promise<RoundRow> {
    if (round && round.status === "active") return round;
    const created = await startNextRound(roomId!, "know_me");
    setRound(created);
    return created;
  }

  async function createFromBank() {
    if (!roomId || !userId) return;
    setError(null);
    setAsking(true);
    try {
      const activeRound = await ensureActiveRound();

      const { data: existing } = await supabase
        .from("experiences")
        .select("question")
        .eq("room_id", roomId)
        .eq("type", "know_me");
      const used = (existing ?? []).map((e: any) => e.question);

      // Deterministic format alternation — Play rounds always favor quick
      // multiple-choice; otherwise alternate strictly within the round so
      // every question doesn't default to the same essay-style format.
      const { count: countInRound } = await supabase
        .from("experiences")
        .select("id", { count: "exact", head: true })
        .eq("round_id", activeRound.id);
      const forceFormat: "choice" | "open" =
        activeRound.round_type === "play"
          ? "choice"
          : (countInRound ?? 0) % 2 === 0
          ? "choice"
          : "open";

      let question: string | null = null;
      let options: string[] | null = null;

      try {
        const res = await fetch("/api/generate-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "know_me",
            usedQuestions: used,
            askerName: "you",
            subjectName: friendName,
            roomId,
            roundType: activeRound.round_type,
            forceFormat,
          }),
        });
        const data = await res.json();
        if (data.question) {
          question = data.question;
          options = data.options ?? null;
        }
      } catch {
        // fall through to static bank below
      }

      if (!question) {
        const usedSet = new Set(used);
        const bank = questionsByType("know_me");
        const next = bank.find((q) => !usedSet.has(q.prompt));
        if (!next) {
          setError("Couldn't generate a question right now — try again in a moment.");
          setAsking(false);
          return;
        }
        question = next.prompt;
        options = next.options;
      }

      const { error: insertErr } = await supabase.from("experiences").insert({
        room_id: roomId,
        round_id: activeRound.id,
        type: "know_me",
        question,
        options,
        created_by: userId,
      });
      if (insertErr) setError(insertErr.message);
      else {
        if (friendId) {
          notify(
            friendId,
            "New question in Know Me 🧠",
            question,
            `/rooms/${roomId}/know-me`
          );
        }
        load();
      }
    } finally {
      setAsking(false);
    }
  }

  async function submitCustomQuestion() {
    if (!roomId || !userId) return;
    if (!customQuestion.trim()) return setError("Write a question first.");
    setError(null);
    try {
      const activeRound = await ensureActiveRound();
      const { error: insertErr } = await supabase.from("experiences").insert({
        room_id: roomId,
        round_id: activeRound.id,
        type: "know_me",
        question: customQuestion.trim(),
        options: customOptions.length >= 2 ? customOptions : null,
        created_by: userId,
      });
      if (insertErr) {
        setError(insertErr.message);
        return;
      }
      if (friendId) {
        notify(
          friendId,
          "New question in Know Me 🧠",
          customQuestion.trim(),
          `/rooms/${roomId}/know-me`
        );
      }
      setCustomQuestion("");
      setCustomOptions([]);
      setAskMode(null);
      load();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    }
  }

  function addOption() {
    if (!optionDraft.trim() || customOptions.length >= 4) return;
    setCustomOptions([...customOptions, optionDraft.trim()]);
    setOptionDraft("");
  }

  async function submitAnswer(option: string) {
    if (!experience || !userId || !round) return;
    const isSubject = experience.created_by !== userId;
    const otherAlreadyAnswered = isSubject
      ? !!predictionAnswer
      : !!selfAnswer;
    await supabase.from("responses").insert({
      experience_id: experience.id,
      profile_id: userId,
      answer: option,
      is_prediction: !isSubject,
    });
    if (otherAlreadyAnswered && friendId) {
      notify(
        friendId,
        "Your reveal is ready ❤️",
        experience.question,
        `/rooms/${roomId}/know-me`
      );
    }
    await completeRoundIfFull(round.id);
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

  // ---------- Round complete: the deliberate hanger ----------
  if (round && round.status === "complete") {
    return (
      <RoundRecap
        roundNumber={round.round_number}
        typeLabel={roundTypeInfo(round.round_type)?.label}
        matches={recapProgress.matches}
        total={recapProgress.completed}
        friendName={friendName}
        discoveries={recapDiscoveries}
        onStartNext={handleStartNextRound}
        starting={startingNext}
        accent="coral"
      />
    );
  }

  const roundLabel = round ? `Round ${round.round_number}` : "Round 1";
  const typeInfo = round ? roundTypeInfo(round.round_type) : null;
  const currentMatched = matchedForId === experience?.id ? roundMatched : null;

  const scoreboard = (
    <div className="mb-4 rounded-card bg-surface px-4 py-2 text-xs text-mute">
      <div className="flex items-center justify-between">
        <span>
          {roundLabel}
          {typeInfo ? ` — ${typeInfo.label}` : ""} · 5 questions each
        </span>
        <button
          onClick={() => router.push(`/rooms/${roomId}/history`)}
          className="text-coral hover:underline"
        >
          History
        </button>
      </div>
      {typeInfo && <p className="mt-1 text-mute">{typeInfo.description}</p>}
    </div>
  );

  const isMyTurn =
    !experience || (isComplete && experience.created_by !== userId);

  if ((!experience || isComplete) && isMyTurn) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        {isComplete && experience && currentMatched !== null && (
          <>
            <RevealCard
              matched={currentMatched}
              yourAnswer={
                (experience.created_by === userId
                  ? predictionAnswer
                  : selfAnswer)!
              }
              theirGuess={
                (experience.created_by === userId
                  ? selfAnswer
                  : predictionAnswer)!
              }
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
              Ask {friendName} something
            </h2>
            <textarea
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="e.g. What's something you've never told me?"
              rows={3}
              className="mt-4 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
            />

            <p className="mt-4 text-sm text-mute">
              Optional: add 2–4 answer choices, or leave blank for an open
              answer.
            </p>
            {customOptions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {customOptions.map((o, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-surface px-3 py-1 text-sm text-paper"
                  >
                    {o}
                  </span>
                ))}
              </div>
            )}
            {customOptions.length < 4 && (
              <div className="mt-2 flex gap-2">
                <input
                  value={optionDraft}
                  onChange={(e) => setOptionDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addOption()}
                  placeholder="Add a choice"
                  className="flex-1 rounded-card bg-surface px-4 py-2 text-sm text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
                />
                <button
                  onClick={addOption}
                  className="rounded-full border border-mute px-4 py-2 text-sm text-paper hover:border-paper"
                >
                  Add
                </button>
              </div>
            )}

            <button
              onClick={submitCustomQuestion}
              className="mt-6 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
            >
              Send question
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
              Send {friendName} a question
            </h1>
            <div className="mt-8 w-full space-y-3">
              <button
                onClick={createFromBank}
                disabled={asking}
                className="w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
              >
                {asking ? "Thinking of one..." : "Surprise me"}
              </button>
              <button
                onClick={() => setAskMode("custom")}
                className="w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
              >
                Ask your own question
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
      </div>
    );
  }

  if (isComplete && !isMyTurn) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        {currentMatched !== null && (
          <RevealCard
            matched={currentMatched}
            yourAnswer={
              (experience!.created_by === userId
                ? predictionAnswer
                : selfAnswer)!
            }
            theirGuess={
              (experience!.created_by === userId
                ? selfAnswer
                : predictionAnswer)!
            }
            friendName={friendName}
          />
        )}
        <CommentThread
          experienceId={experience!.id}
          userId={userId!}
          friendName={friendName}
        />
        <p className="mt-6 text-center text-sm text-mute">
          Waiting for {friendName} to send the next question.
        </p>
      </div>
    );
  }

  const isSubject = experience!.created_by !== userId;
  const alreadyAnswered = isSubject ? !!selfAnswer : !!predictionAnswer;

  if (alreadyAnswered) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-wide text-mute">
            Waiting on {friendName}
          </p>
          <p className="mt-4 max-w-xs text-mute">
            You&rsquo;ve answered. We&rsquo;ll reveal it as soon as they do too.
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
          {isSubject ? "Answer for yourself" : `Guess ${friendName}'s answer`}
        </p>
        <h1 className="font-serif mt-3 text-2xl font-semibold leading-snug">
          {isSubject
            ? experience!.question
            : `What would ${friendName} say? "${experience!.question}"`}
        </h1>

        {experience!.options && experience!.options.length > 0 ? (
          <div className="mt-8 space-y-3">
            {experience!.options.map((option) => (
              <button
                key={option}
                onClick={() => submitAnswer(option)}
                className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-coral hover:text-coral"
              >
                {option}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-8">
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Type your answer..."
              rows={3}
              className="w-full rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
            />
            <button
              onClick={() => freeText.trim() && submitAnswer(freeText.trim())}
              disabled={!freeText.trim()}
              className="mt-4 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
            >
              Send answer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

