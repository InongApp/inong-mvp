"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { questionsByType } from "@/lib/questions";
import { useRoomSession } from "@/lib/useRoomSession";
import RevealCard from "@/components/RevealCard";
import CommentThread from "@/components/CommentThread";

type Experience = {
  id: string;
  question: string;
  options: string[] | null;
  created_by: string;
};

// Same role convention as Know Me: the ASKER (created_by) predicts; the
// other member answers for themselves. Being the subject one round earns
// you the next turn to ask.

export default function BetOnMePage() {
  const { userId, roomId, friendName, ready } = useRoomSession();
  const [experience, setExperience] = useState<Experience | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [selfAnswer, setSelfAnswer] = useState<string | null>(null);
  const [predictionAnswer, setPredictionAnswer] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
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

    const { data: experiences } = await supabase
      .from("experiences")
      .select("id, question, options, created_by")
      .eq("room_id", roomId)
      .eq("type", "bet_on_me")
      .order("created_at", { ascending: true });

    const last = (experiences ?? [])[
      (experiences ?? []).length - 1
    ] as Experience | undefined;

    if (!last) {
      setExperience(null);
      setIsComplete(false);
      setSelfAnswer(null);
      setPredictionAnswer(null);
      setLoading(false);
      return;
    }

    const { data: responses } = await supabase
      .from("responses")
      .select("profile_id, answer, is_prediction")
      .eq("experience_id", last.id);

    const complete = (responses ?? []).length >= 2;
    setExperience(last);
    setIsComplete(complete);

    const mine = (responses ?? []).find((r) => r.profile_id === userId);
    const theirs = (responses ?? []).find((r) => r.profile_id !== userId);

    if (last.created_by === userId) {
      setPredictionAnswer(mine?.answer ?? null);
      setSelfAnswer(theirs?.answer ?? null);
    } else {
      setSelfAnswer(mine?.answer ?? null);
      setPredictionAnswer(theirs?.answer ?? null);
    }

    setLoading(false);
  }

  async function createFromBank() {
    if (!roomId || !userId) return;
    setError(null);
    const { data: existing } = await supabase
      .from("experiences")
      .select("question")
      .eq("room_id", roomId)
      .eq("type", "bet_on_me");
    const used = new Set((existing ?? []).map((e: any) => e.question));

    const bank = questionsByType("bet_on_me");
    const next = bank.find((q) => !used.has(q.prompt));
    if (!next) {
      setError(
        "You've used every question in the bank — try 'Ask your own' instead."
      );
      return;
    }
    const { error: insertErr } = await supabase.from("experiences").insert({
      room_id: roomId,
      type: "bet_on_me",
      question: next.prompt,
      options: next.options,
      created_by: userId,
    });
    if (insertErr) setError(insertErr.message);
    else load();
  }

  async function submitCustomQuestion() {
    if (!roomId || !userId) return;
    if (!customQuestion.trim()) return setError("Write a question first.");
    setError(null);
    const { error: insertErr } = await supabase.from("experiences").insert({
      room_id: roomId,
      type: "bet_on_me",
      question: customQuestion.trim(),
      options: customOptions.length >= 2 ? customOptions : null,
      created_by: userId,
    });
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setCustomQuestion("");
    setCustomOptions([]);
    setAskMode(null);
    load();
  }

  function addOption() {
    if (!optionDraft.trim() || customOptions.length >= 4) return;
    setCustomOptions([...customOptions, optionDraft.trim()]);
    setOptionDraft("");
  }

  async function submitAnswer(option: string) {
    if (!experience || !userId) return;
    const isSubject = experience.created_by !== userId;
    await supabase.from("responses").insert({
      experience_id: experience.id,
      profile_id: userId,
      answer: option,
      is_prediction: !isSubject,
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

  const isMyTurn =
    !experience || (isComplete && experience.created_by !== userId);

  if ((!experience || isComplete) && isMyTurn) {
    return (
      <div className="flex flex-1 flex-col">
        {isComplete && experience && (
          <>
            <RevealCard
              matched={selfAnswer === predictionAnswer}
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
              Bet on {friendName}
            </h2>
            <textarea
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="e.g. What will I order at the game tonight?"
              rows={3}
              className="mt-4 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-skyblue"
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
                  className="flex-1 rounded-card bg-surface px-4 py-2 text-sm text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-skyblue"
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
              className="mt-6 w-full rounded-full bg-skyblue py-4 font-medium text-ink transition hover:opacity-90"
            >
              Send question
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-sm uppercase tracking-wide text-mute">
              Your turn
            </p>
            <h1 className="font-serif mt-3 text-2xl font-semibold">
              Bet on {friendName}
            </h1>
            <div className="mt-8 w-full space-y-3">
              <button
                onClick={createFromBank}
                className="w-full rounded-full bg-skyblue py-4 font-medium text-ink transition hover:opacity-90"
              >
                Surprise me
              </button>
              <button
                onClick={() => setAskMode("custom")}
                className="w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
              >
                Ask your own bet
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
        <RevealCard
          matched={selfAnswer === predictionAnswer}
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
        <CommentThread
          experienceId={experience!.id}
          userId={userId!}
          friendName={friendName}
        />
        <p className="mt-6 text-center text-sm text-mute">
          Waiting for {friendName} to send the next bet.
        </p>
      </div>
    );
  }

  const isSubject = experience!.created_by !== userId;
  const alreadyAnswered = isSubject ? !!selfAnswer : !!predictionAnswer;

  if (alreadyAnswered) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-sm uppercase tracking-wide text-mute">
          Waiting on {friendName}
        </p>
        <p className="mt-4 max-w-xs text-mute">
          Your answer&rsquo;s locked in. We&rsquo;ll reveal it once they&rsquo;ve
          answered too.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <p className="text-sm uppercase tracking-wide text-mute">
        {isSubject ? "Answer for yourself" : `Bet on ${friendName}`}
      </p>
      <h1 className="font-serif mt-3 text-2xl font-semibold leading-snug">
        {isSubject
          ? experience!.question
          : `What will ${friendName} pick? "${experience!.question}"`}
      </h1>

      {experience!.options && experience!.options.length > 0 ? (
        <div className="mt-8 space-y-3">
          {experience!.options.map((option) => (
            <button
              key={option}
              onClick={() => submitAnswer(option)}
              className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-skyblue hover:text-skyblue"
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
            className="w-full rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-skyblue"
          />
          <button
            onClick={() => freeText.trim() && submitAnswer(freeText.trim())}
            disabled={!freeText.trim()}
            className="mt-4 w-full rounded-full bg-skyblue py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
          >
            Send answer
          </button>
        </div>
      )}
    </div>
  );
}

