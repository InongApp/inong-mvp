"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { questionsByType } from "@/lib/questions";
import { useRoomSession } from "@/lib/useRoomSession";
import {
  getLatestRound,
  startNextRound,
  completeRoundIfFull,
  roundTypeInfo,
  RoundRow,
} from "@/lib/rounds";
import { getBalance, STARTING_BALANCE } from "@/lib/betBalance";
import { notify } from "@/lib/notifyClient";
import CommentThread from "@/components/CommentThread";
import WagerSelector from "@/components/WagerSelector";
import BetRevealCard from "@/components/BetRevealCard";
import BetRoundRecap from "@/components/BetRoundRecap";

// Bet on Me has its own identity, not a Know-Me reskin: the person who
// creates the scenario (created_by) is the SUBJECT — they'll reveal a real
// choice. The other member is the BETTOR — they wager points predicting
// it. This is the OPPOSITE role convention from Know Me (where created_by
// predicts) — deliberate, since here the Subject is the one with something
// real to reveal about themselves.
//
// A round still means 5 turns per player (10 total), reusing the same
// Round/Journey/Discoveries infrastructure as Know Me — only the resolution
// mechanic (points, not match/no-match) is genuinely different.

type Experience = {
  id: string;
  question: string;
  options: string[] | null;
  created_by: string;
};

type Bet = {
  id: string;
  profile_id: string;
  chosen_option: string;
  points_wagered: number;
  resolved: boolean;
  won: boolean | null;
  points_delta: number | null;
};

type Discovery = { id: string; summary: string };

export default function BetOnMePage() {
  const router = useRouter();
  const { userId, roomId, friendId, friendName, ready } = useRoomSession();

  const [round, setRound] = useState<RoundRow | null>(null);
  const [recapDiscoveries, setRecapDiscoveries] = useState<Discovery[]>([]);
  const [recapNetPoints, setRecapNetPoints] = useState(0);
  const [startingNext, setStartingNext] = useState(false);

  const [experience, setExperience] = useState<Experience | null>(null);
  const [response, setResponse] = useState<{ answer: string } | null>(null); // subject's true choice
  const [bet, setBet] = useState<Bet | null>(null);
  const [balance, setBalance] = useState(STARTING_BALANCE);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [askMode, setAskMode] = useState<"custom" | null>(null);
  const [customQuestion, setCustomQuestion] = useState("");
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState("");
  const [wager, setWager] = useState<number | null>(null);
  const [forcedWager, setForcedWager] = useState<number | null>(null); // set by Double or Nothing
  const [doublingUp, setDoublingUp] = useState(false);
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

    const bal = await getBalance(roomId, userId);
    setBalance(bal);

    const latest = await getLatestRound(roomId, "bet_on_me");

    if (latest && latest.status === "complete") {
      setRound(latest);

      const { data: exps } = await supabase
        .from("experiences")
        .select("id")
        .eq("round_id", latest.id);
      const expIds = (exps ?? []).map((e: any) => e.id);

      if (expIds.length > 0) {
        const { data: roundBets } = await supabase
          .from("bets")
          .select("profile_id, points_delta")
          .in("experience_id", expIds)
          .eq("profile_id", userId);
        const net = (roundBets ?? []).reduce(
          (sum: number, b: any) => sum + (b.points_delta ?? 0),
          0
        );
        setRecapNetPoints(net);

        const { data: discoveries } = await supabase
          .from("discoveries")
          .select("id, summary")
          .in("source_experience_id", expIds);
        setRecapDiscoveries((discoveries as Discovery[]) ?? []);
      } else {
        setRecapNetPoints(0);
        setRecapDiscoveries([]);
      }

      setLoading(false);
      return;
    }

    setRound(latest);

    if (!latest) {
      setExperience(null);
      setResponse(null);
      setBet(null);
      setLoading(false);
      return;
    }

    const { data: experiences } = await supabase
      .from("experiences")
      .select("id, question, options, created_by")
      .eq("round_id", latest.id)
      .order("created_at", { ascending: true });

    const last = (experiences ?? [])[
      (experiences ?? []).length - 1
    ] as Experience | undefined;

    if (!last) {
      setExperience(null);
      setResponse(null);
      setBet(null);
      setLoading(false);
      return;
    }

    setExperience(last);

    const { data: responses } = await supabase
      .from("responses")
      .select("answer")
      .eq("experience_id", last.id)
      .eq("is_prediction", false)
      .maybeSingle();
    setResponse(responses ?? null);

    const { data: betRow } = await supabase
      .from("bets")
      .select("id, profile_id, chosen_option, points_wagered, resolved, won, points_delta")
      .eq("experience_id", last.id)
      .maybeSingle();
    setBet((betRow as Bet) ?? null);

    // Both sides exist but not yet resolved — resolve now. Safe to call
    // redundantly from either browser; the DB function is idempotent.
    if (responses && betRow && !(betRow as Bet).resolved) {
      await supabase.rpc("resolve_bet", { p_bet_id: (betRow as Bet).id });
      const { data: freshBet } = await supabase
        .from("bets")
        .select("id, profile_id, chosen_option, points_wagered, resolved, won, points_delta")
        .eq("id", (betRow as Bet).id)
        .single();
      setBet((freshBet as Bet) ?? (betRow as Bet));
      const freshBalance = await getBalance(roomId, userId);
      setBalance(freshBalance);

      // Extraction is the subject's job, same convention as Know Me
      if (last.created_by === userId) {
        fetch("/api/discoveries/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            experienceId: last.id,
            profileId: userId,
            question: last.question,
            answer: responses.answer,
          }),
        }).catch(() => {});
      }
    }

    setLoading(false);
  }

  async function ensureActiveRound(): Promise<RoundRow> {
    if (round && round.status === "active") return round;
    const created = await startNextRound(roomId!, "bet_on_me");
    setRound(created);
    return created;
  }

  async function createScenario(question: string, options: string[]) {
    if (!roomId || !userId) return;
    const activeRound = await ensureActiveRound();
    const { error: insertErr } = await supabase.from("experiences").insert({
      room_id: roomId,
      round_id: activeRound.id,
      type: "bet_on_me",
      question,
      options,
      created_by: userId,
    });
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    if (friendId) {
      notify(
        friendId,
        "New scenario in Bet on Me 🎰",
        question,
        `/rooms/${roomId}/bet-on-me`
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
        .eq("type", "bet_on_me");
      const used = (existing ?? []).map((e: any) => e.question);

      let question: string | null = null;
      let options: string[] | null = null;

      try {
        const activeRound = round ?? (await ensureActiveRound());
        const res = await fetch("/api/generate-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "bet_on_me",
            usedQuestions: used,
            askerName: friendName,
            subjectName: "you",
            roomId,
            roundType: activeRound.round_type,
            forceFormat: "choice", // betting needs discrete options, always
          }),
        });
        const data = await res.json();
        if (data.question && data.options) {
          question = data.question;
          options = data.options;
        }
      } catch {
        // fall through to static bank below
      }

      if (!question || !options) {
        const usedSet = new Set(used);
        const bank = questionsByType("bet_on_me").filter((q) => q.options);
        const next = bank.find((q) => !usedSet.has(q.prompt));
        if (!next) {
          setError("Couldn't generate a scenario right now — try again in a moment.");
          setAsking(false);
          return;
        }
        question = next.prompt;
        options = next.options;
      }

      await createScenario(question, options);
    } finally {
      setAsking(false);
    }
  }

  function addOption() {
    if (!optionDraft.trim() || customOptions.length >= 4) return;
    setCustomOptions([...customOptions, optionDraft.trim()]);
    setOptionDraft("");
  }

  async function submitCustomScenario() {
    if (!customQuestion.trim()) return setError("Write a scenario first.");
    if (customOptions.length < 2) {
      return setError("Add at least 2 options for your Inong to bet on.");
    }
    setError(null);
    await createScenario(customQuestion.trim(), customOptions);
    setCustomQuestion("");
    setCustomOptions([]);
    setAskMode(null);
  }

  async function revealTrueChoice(option: string) {
    if (!experience || !userId) return;
    await supabase.from("responses").insert({
      experience_id: experience.id,
      profile_id: userId,
      answer: option,
      is_prediction: false,
    });
    load();
  }

  async function placeBet(option: string) {
    if (!experience || !userId || !wager) return;
    const { error: betErr } = await supabase.from("bets").insert({
      experience_id: experience.id,
      profile_id: userId,
      chosen_option: option,
      points_wagered: wager,
    });
    if (betErr) {
      setError(betErr.message);
      return;
    }
    setWager(null);
    load();
  }

  async function handleDoubleOrNothing() {
    if (!roomId || !experience || !bet || !bet.points_delta) return;
    setDoublingUp(true);
    setError(null);
    try {
      const nextWager = bet.points_delta; // exactly what was just won
      const activeRound = round!;

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
            askerName: friendName,
            subjectName: "you",
            roomId,
            roundType: activeRound.round_type,
            forceFormat: "choice",
          }),
        });
        const data = await res.json();
        if (data.question && data.options) {
          question = data.question;
          options = data.options;
        }
      } catch {}

      if (!question || !options) {
        setError("Couldn't set up the next bet right now — try again in a moment.");
        return;
      }

      const { error: insertErr } = await supabase.from("experiences").insert({
        room_id: roomId,
        round_id: activeRound.id,
        type: "bet_on_me",
        question,
        options,
        created_by: experience.created_by, // same subject continues
      });
      if (insertErr) throw insertErr;

      // Pre-fill the wager at exactly what was won — the bettor still picks
      // their own option on the normal betting screen, nothing is placed
      // automatically on their behalf.
      setForcedWager(nextWager);
      setWager(nextWager);
      load();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setDoublingUp(false);
    }
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
      <BetRoundRecap
        roundNumber={round.round_number}
        typeLabel={roundTypeInfo(round.round_type)?.label}
        netPoints={recapNetPoints}
        balance={balance}
        friendName={friendName}
        discoveries={recapDiscoveries}
        onStartNext={async () => {
          setStartingNext(true);
          try {
            await startNextRound(roomId!, "bet_on_me");
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

  const roundLabel = round ? `Round ${round.round_number}` : "Round 1";
  const typeInfo = round ? roundTypeInfo(round.round_type) : null;

  const scoreboard = (
    <div className="mb-4 rounded-card bg-surface px-4 py-2 text-xs text-mute">
      <div className="flex items-center justify-between">
        <span>
          {roundLabel}
          {typeInfo ? ` — ${typeInfo.label}` : ""} · 5 bets each
        </span>
        <button
          onClick={() => router.push(`/rooms/${roomId}/history`)}
          className="text-skyblue hover:underline"
        >
          History
        </button>
      </div>
      <p className="mt-1">Balance: {balance} points</p>
    </div>
  );

  const isSubject = experience ? experience.created_by === userId : false;
  const isMyTurnToPresent = !experience || (bet?.resolved && !isSubject);

  // ---------- Resolved: show the outcome to both people ----------
  if (experience && bet?.resolved && response) {
    const iAmBettor = bet.profile_id === userId;
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        <BetRevealCard
          won={!!bet.won}
          pointsDelta={bet.points_delta ?? 0}
          trueAnswer={response.answer}
          chosenOption={bet.chosen_option}
          pointsWagered={bet.points_wagered}
          subjectName={isSubject ? "You" : friendName}
          bettorName={iAmBettor ? "You" : friendName}
          isBettor={iAmBettor}
          onDoubleOrNothing={handleDoubleOrNothing}
          doublingUp={doublingUp}
        />
        <CommentThread
          experienceId={experience.id}
          userId={userId!}
          friendName={friendName}
        />
        {isMyTurnToPresent ? (
          <div className="mt-6 space-y-3">
            {typeInfo && (
              <div className="rounded-card bg-skyblue/10 px-4 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-skyblue">
                  {typeInfo.label} round
                </p>
                <p className="mt-1 text-sm text-paper">{typeInfo.description}</p>
              </div>
            )}
            <button
              onClick={createFromBank}
              disabled={asking}
              className="w-full rounded-full bg-skyblue py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
            >
              {asking ? "Thinking of one..." : "Present the next scenario"}
            </button>
          </div>
        ) : (
          <p className="mt-6 text-center text-sm text-mute">
            Waiting for {friendName} to present the next scenario.
          </p>
        )}
        {error && <p className="mt-4 text-center text-sm text-coral">{error}</p>}
      </div>
    );
  }

  // ---------- No active scenario, it's my turn to present one ----------
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
              Give {friendName} something to bet on
            </h2>
            <textarea
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="e.g. What will I actually order for dinner tonight?"
              rows={3}
              className="mt-4 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-skyblue"
            />
            <p className="mt-4 text-sm text-mute">
              Add 2–4 options — {friendName} will bet on one.
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
                  placeholder="Add an option"
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
              onClick={submitCustomScenario}
              className="mt-6 w-full rounded-full bg-skyblue py-4 font-medium text-ink transition hover:opacity-90"
            >
              Send scenario
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            {typeInfo && (
              <div className="mb-4 rounded-card bg-skyblue/10 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-skyblue">
                  {typeInfo.label} round
                </p>
                <p className="mt-1 text-sm text-paper">{typeInfo.description}</p>
              </div>
            )}
            <p className="text-sm uppercase tracking-wide text-mute">
              Your turn
            </p>
            <h1 className="font-serif mt-3 text-2xl font-semibold">
              Give {friendName} something to bet on
            </h1>
            <div className="mt-8 w-full space-y-3">
              <button
                onClick={createFromBank}
                disabled={asking}
                className="w-full rounded-full bg-skyblue py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
              >
                {asking ? "Thinking of one..." : "Play"}
              </button>
              <button
                onClick={() => setAskMode("custom")}
                className="w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
              >
                Set up your own scenario
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
      </div>
    );
  }

  // ---------- Active scenario, not yet resolved ----------
  if (isSubject) {
    if (response) {
      return (
        <div className="flex flex-1 flex-col">
          {scoreboard}
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-sm uppercase tracking-wide text-mute">
              Locked in
            </p>
            <p className="mt-4 max-w-xs text-mute">
              Waiting for {friendName} to place their bet.
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
            Reveal your real choice
          </p>
          <h1 className="font-serif mt-3 text-2xl font-semibold leading-snug">
            {experience!.question}
          </h1>
          <p className="mt-2 text-sm text-mute">
            {friendName} won&rsquo;t see this until they&rsquo;ve placed their bet.
          </p>
          <div className="mt-8 space-y-3">
            {experience!.options!.map((option) => (
              <button
                key={option}
                onClick={() => revealTrueChoice(option)}
                className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-skyblue hover:text-skyblue"
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // I'm the bettor
  if (bet) {
    return (
      <div className="flex flex-1 flex-col">
        {scoreboard}
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm uppercase tracking-wide text-mute">
            Bet placed
          </p>
          <p className="mt-4 max-w-xs text-mute">
            You bet {bet.points_wagered} points on &ldquo;{bet.chosen_option}
            &rdquo;. Waiting for {friendName} to reveal.
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
          Bet on {friendName}
        </p>
        <h1 className="font-serif mt-3 text-2xl font-semibold leading-snug">
          {experience!.question}
        </h1>

        <div className="mt-6">
          {forcedWager ? (
            <div className="rounded-card bg-coral/10 px-4 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-coral">
                Double or nothing
              </p>
              <p className="mt-1 text-sm text-paper">
                Wagering {forcedWager} points — pick your option below.
              </p>
            </div>
          ) : (
            <WagerSelector balance={balance} value={wager} onChange={setWager} />
          )}
        </div>

        <div className="mt-6 space-y-3">
          {experience!.options!.map((option) => (
            <button
              key={option}
              disabled={!wager}
              onClick={() => {
                placeBet(option);
                setForcedWager(null);
              }}
              className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-skyblue hover:text-skyblue disabled:cursor-not-allowed disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>
        {!wager && (
          <p className="mt-3 text-center text-xs text-mute">
            Pick a wager amount above first.
          </p>
        )}

        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
      </div>
    </div>
  );
}

