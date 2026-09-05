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

export default function BetOnMePage() {
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

    const latest = await getLatestRound(roomId, "bet_on_me");

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

        fetch("/api/discoveries/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            experienceId: last.id,
            profileId:
              last.created_by === userId ? theirs?.profile_id ?? friendId : userId,
            question: last.question,
            answer: self,
          }),
        }).catch(() => {});
      }
    }

    setLoading(false);
  }

  async function handleStartNextRound() {
    if (!roomId) return;
    setStartingNext(true);
    try {
      await startNextRound(roomId, "bet_on_me");
      await load();
    } catch (e: any) {
      setError(e.message ?? "Couldn't start the next round.");
    } finally {
      setStartingNext(false);
    }
  }

  async function ensureActiveRound(): Promise<RoundRow> {
    if (round && round.status === "active") return round;
    const created = await startNextRound(roomId!, "bet_on_me");
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
        .eq("type", "bet_on_me");
      const used = (existing ?? []).map((e: any) => e.question);

      let question: string | null = null;
      let options: string[] | null = null;

      try {
        const res = await fetch("/api/generate-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "bet_on_me",
            usedQuestions: used,
            askerName: "you",
            subjectName: friendName,
            roomId,
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
        const bank = questionsByType("bet_on_me");
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
        type: "bet_on_me",
        question,
        options,
        created_by: userId,
      });
      if (insertErr) setError(insertErr.message);
      else {
        if (friendId) {
          notify(
            friendId,
            "New bet in Bet on Me 🎯",
            question,
            `/rooms/${roomId}/bet-on-me`
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
        type: "bet_on_me",
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
          "New bet in Bet on Me 🎯",
          customQuestion.trim(),
          `/rooms/${roomId}/bet-on-me`
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
        `/rooms/${roomId}/bet-on-me`
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

  if (round && round.status === "complete") {
    return (
      <RoundRecap
        roundNumber={round.round_number}
        matches={recapProgress.matches}
        total={recapProgress.completed}
        friendName={friendName}
        discoveries={recapDiscoveries}
        onStartNext={handleStartNextRound}
        starting={startingNext}
        accent="skyblue"
      />
    );
  }

  const roundLabel = round ? `Round ${round.round_number}` : "Round 1";
  const currentMatched = matchedForId === experience?.id ? roundMatched : null;

  const scoreboard = (
    <div className="mb-4 flex items-center justify-between rounded-card bg-surface px-4 py-2 text-xs text-mute">
      <span>{roundLabel} — 5 bets each</span>
      <button
        onClick={() => router.push(`/rooms/${roomId}/history`)}
        className="text-skyblue hover:underline"
      >
        History
      </button>
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
                disabled={asking}
                className="w-full rounded-full bg-skyblue py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
              >
                {asking ? "Thinking of one..." : "Surprise me"}
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
          Waiting for {friendName} to send the next bet.
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
            Your answer&rsquo;s locked in. We&rsquo;ll reveal it once they&rsquo;ve
            answered too.
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
    </div>
  );
}

