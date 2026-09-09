"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getOverallStats, verdictFor } from "@/lib/roomStats";
import { roundTypeInfo } from "@/lib/rounds";
import CommentThread from "@/components/CommentThread";

type ExpType = "know_me" | "bet_on_me" | "visuals_in_words" | "visuals_guess";

type HistoryEntry = {
  id: string;
  type: ExpType;
  question: string;
  // know_me / bet_on_me
  selfAnswer?: string | null;
  predictionAnswer?: string | null;
  matched?: boolean;
  // visuals_in_words (Compare) — both are personal descriptions, no score
  answerA?: string | null;
  answerB?: string | null;
  // visuals_guess (Guess the Picture)
  clue1?: string | null;
  clue2?: string | null;
  correctAnswer?: string | null;
  guessAnswer?: string | null;
  cluesUsed?: number | null;
  correct?: boolean | null;
  points?: number | null;
};

type RoundGroup = {
  key: string;
  type: ExpType;
  roundNumber: number | null; // null = legacy pre-round data
  roundType: string | null;
  status: "active" | "complete" | null;
  entries: HistoryEntry[];
  discoveries: string[];
};

const TYPE_LABEL: Record<ExpType, string> = {
  know_me: "Know Me",
  bet_on_me: "Bet on Me",
  visuals_in_words: "Visuals in Words",
  visuals_guess: "Guess the Picture",
};

export default function HistoryPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("your Inong");
  const [groups, setGroups] = useState<RoundGroup[]>([]);
  const [overall, setOverall] = useState({ totalCompleted: 0, totalMatches: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
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
    const uid = session.user.id;
    setUserId(uid);

    const { data: memberRows } = await supabase
      .from("room_members")
      .select("profile_id, profiles(display_name)")
      .eq("room_id", params.roomId);
    const other: any = (memberRows ?? []).find((m: any) => m.profile_id !== uid);
    if (other) setFriendName(other.profiles?.display_name ?? "your Inong");

    const { data: experiences } = await supabase
      .from("experiences")
      .select(
        "id, type, question, options, created_by, ai_matched, clue_1, clue_2, correct_answer, round_id, experience_rounds(round_number, round_type, status)"
      )
      .eq("room_id", params.roomId)
      .in("type", ["know_me", "bet_on_me", "visuals_in_words", "visuals_guess"])
      .order("created_at", { ascending: false });

    const ids = (experiences ?? []).map((e: any) => e.id);
    const [{ data: allResponses }, { data: allDiscoveries }, { data: allGuessResults }] =
      await Promise.all([
        ids.length > 0
          ? supabase
              .from("responses")
              .select("experience_id, profile_id, answer, is_prediction")
              .in("experience_id", ids)
          : Promise.resolve({ data: [] } as any),
        ids.length > 0
          ? supabase
              .from("discoveries")
              .select("source_experience_id, summary")
              .in("source_experience_id", ids)
          : Promise.resolve({ data: [] } as any),
        ids.length > 0
          ? supabase
              .from("guess_results")
              .select("experience_id, guesser_profile_id, guess_answer, clues_used, correct, points")
              .in("experience_id", ids)
          : Promise.resolve({ data: [] } as any),
      ]);

    const groupMap = new Map<string, RoundGroup>();

    function ensureGroup(e: any): RoundGroup {
      const roundInfo: any = e.experience_rounds;
      const roundNumber = roundInfo?.round_number ?? null;
      const roundType = roundInfo?.round_type ?? null;
      const status = roundInfo?.status ?? null;
      const key = `${e.type}-${roundNumber ?? "legacy"}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          key,
          type: e.type,
          roundNumber,
          roundType,
          status,
          entries: [],
          discoveries: [],
        });
      }
      return groupMap.get(key)!;
    }

    for (const e of experiences ?? []) {
      if (e.type === "visuals_guess") {
        const result = (allGuessResults ?? []).find(
          (g: any) => g.experience_id === e.id
        );
        if (!result) continue; // only show resolved guesses
        const group = ensureGroup(e);
        group.entries.push({
          id: e.id,
          type: "visuals_guess",
          question: e.question,
          clue1: e.clue_1,
          clue2: e.clue_2,
          correctAnswer: e.correct_answer,
          guessAnswer: result.guess_answer,
          cluesUsed: result.clues_used,
          correct: result.correct,
          points: result.points,
        });
        continue;
      }

      const rs = (allResponses ?? []).filter(
        (r: any) => r.experience_id === e.id
      );
      if (rs.length < 2) continue; // only show completed rounds

      if (e.type === "visuals_in_words") {
        const [a, b] = rs;
        const group = ensureGroup(e);
        group.entries.push({
          id: e.id,
          type: "visuals_in_words",
          question: e.question,
          answerA: a?.answer ?? null,
          answerB: b?.answer ?? null,
        });
        const discovery = (allDiscoveries ?? []).find(
          (d: any) => d.source_experience_id === e.id
        );
        if (discovery) group.discoveries.push(discovery.summary);
        continue;
      }

      // know_me / bet_on_me
      const self = rs.find((r: any) => !r.is_prediction);
      const pred = rs.find((r: any) => r.is_prediction);
      if (!self || !pred) continue;

      const hasOptions = !!e.options && e.options.length > 0;
      const matched = hasOptions
        ? self.answer === pred.answer
        : e.ai_matched === true;

      const group = ensureGroup(e);
      group.entries.push({
        id: e.id,
        type: e.type,
        question: e.question,
        selfAnswer: self.answer,
        predictionAnswer: pred.answer,
        matched,
      });

      const discovery = (allDiscoveries ?? []).find(
        (d: any) => d.source_experience_id === e.id
      );
      if (discovery) group.discoveries.push(discovery.summary);
    }

    const groupList = Array.from(groupMap.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return (b.roundNumber ?? 0) - (a.roundNumber ?? 0);
    });
    setGroups(groupList);

    const stats = await getOverallStats(params.roomId);
    setOverall(stats);

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading history...
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

      <h1 className="font-serif mt-4 text-2xl font-semibold">Your Journey</h1>

      <div className="mt-4 rounded-card bg-surface px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-mute">All-time</p>
        <p className="font-serif mt-1 text-2xl text-coral">
          {overall.totalMatches}/{overall.totalCompleted} matched
        </p>
        <p className="mt-1 text-xs text-mute">
          (Know Me and Bet on Me only — Visuals in Words has no score, Guess
          the Picture tracks points separately.)
        </p>
      </div>

      {groups.length === 0 && (
        <p className="mt-8 text-center text-mute">
          No completed rounds yet — play something, and it'll show up here.
        </p>
      )}

      <div className="mt-6 flex-1 space-y-6">
        {groups.map((group) => {
          const isScored = group.type === "know_me" || group.type === "bet_on_me";
          const matches = isScored
            ? group.entries.filter((e) => e.matched).length
            : 0;
          const total = group.entries.length;

          return (
            <div key={group.key}>
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-mute">
                  {TYPE_LABEL[group.type]} —{" "}
                  {group.roundNumber
                    ? `Round ${group.roundNumber}${
                        group.roundType
                          ? ` (${roundTypeInfo(group.roundType as any)?.label ?? group.roundType})`
                          : ""
                      }`
                    : "Earlier"}
                </p>
                {isScored && (
                  <p className="text-xs text-mute">
                    {matches}/{total}
                    {group.status === "complete" ? " · complete" : ""}
                  </p>
                )}
              </div>
              {isScored && group.status === "complete" && (
                <p className="mt-1 text-sm text-coral">
                  {verdictFor(matches, total)}
                </p>
              )}

              {group.discoveries.length > 0 && (
                <div className="mt-2 space-y-1">
                  {group.discoveries.map((d, i) => (
                    <p key={i} className="text-xs text-skyblue">
                      ✦ {d}
                    </p>
                  ))}
                </div>
              )}

              <div className="mt-3 space-y-2">
                {group.entries.map((entry) => (
                  <div key={entry.id} className="rounded-card bg-surface px-4 py-3">
                    <button
                      onClick={() =>
                        setOpenId(openId === entry.id ? null : entry.id)
                      }
                      className="w-full text-left"
                    >
                      {entry.type === "know_me" || entry.type === "bet_on_me" ? (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm text-paper">{entry.question}</p>
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm ${
                                entry.matched ? "bg-coral" : ""
                              }`}
                            >
                              {entry.matched ? (
                                <span className="text-white">✓</span>
                              ) : (
                                "😂"
                              )}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-mute">
                            {entry.selfAnswer} vs {entry.predictionAnswer}
                          </p>
                        </>
                      ) : entry.type === "visuals_in_words" ? (
                        <>
                          <p className="text-sm text-paper">🎨 {entry.question}</p>
                          <p className="mt-1 text-xs text-mute">
                            {entry.answerA} · {entry.answerB}
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm text-paper">
                              🕵️ {entry.correctAnswer}
                            </p>
                            <span className="text-lg">
                              {entry.correct ? "🎯" : "😂"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-mute">
                            Guessed &ldquo;{entry.guessAnswer}&rdquo; after{" "}
                            {entry.cluesUsed} clue{entry.cluesUsed !== 1 ? "s" : ""} ·{" "}
                            {entry.points} pt{entry.points !== 1 ? "s" : ""}
                          </p>
                        </>
                      )}
                    </button>

                    {openId === entry.id && (
                      <CommentThread
                        experienceId={entry.id}
                        userId={userId!}
                        friendName={friendName}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

