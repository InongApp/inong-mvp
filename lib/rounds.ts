import { supabase } from "@/lib/supabase";

export type ExperienceType =
  | "know_me"
  | "bet_on_me"
  | "visuals_in_words"
  | "visuals_guess";

// 5 alternating turns per player = 10 total. This is the finite
// "hanger" unit — deliberate, not a limitation. The Journey (all rounds
// over time) stays open-ended; only the Round is finite.
export const ROUND_SIZE = 10;

// The Relationship Intelligence layer: WHAT KIND of round comes next,
// not just another random 5 questions. Selection is plain rule-based
// code — no AI spent deciding this, only on writing the question itself.
// V2: the choice is now WEIGHTED by real signals from the last round
// (its emotional tone, and whether response times suggest fatigue) —
// not a uniform random pick among valid options.
export const ROUND_TYPES = [
  {
    key: "discover",
    label: "Discover",
    description: "Explore something brand new about each other.",
  },
  {
    key: "play",
    label: "Play",
    description: "Quick, fun, and a little competitive.",
  },
  {
    key: "deepen",
    label: "Deepen",
    description: "Going deeper on something you discovered.",
  },
  {
    key: "surprise",
    label: "Surprise",
    description: "Expect the unexpected.",
  },
  {
    key: "connection",
    label: "Connection",
    description: "About the two of you together, not just one of you.",
  },
  {
    key: "memory",
    label: "Memory",
    description: "Revisiting something from your journey.",
  },
] as const;

export type RoundType = (typeof ROUND_TYPES)[number]["key"];

export function roundTypeInfo(key: RoundType | null) {
  return ROUND_TYPES.find((r) => r.key === key) ?? null;
}

type SignalRound = {
  tone: string | null;
  avg_response_seconds: number | null;
  match_rate: number | null;
};

async function getRecentSignals(
  roomId: string,
  type: ExperienceType
): Promise<SignalRound[]> {
  const { data } = await supabase
    .from("experience_rounds")
    .select("tone, avg_response_seconds, match_rate")
    .eq("room_id", roomId)
    .eq("type", type)
    .eq("status", "complete")
    .order("round_number", { ascending: false })
    .limit(2);
  return (data as SignalRound[]) ?? [];
}

function weightCandidates(
  candidates: RoundType[],
  signals: SignalRound[]
): { type: RoundType; weight: number }[] {
  const [last, prev] = signals;
  const tone = last?.tone ?? null;

  let fatigueRisk = false;
  if (
    last?.avg_response_seconds != null &&
    prev?.avg_response_seconds != null &&
    prev.avg_response_seconds > 0
  ) {
    fatigueRisk = last.avg_response_seconds > prev.avg_response_seconds * 1.5;
  }

  const highEngagement =
    !fatigueRisk && last?.match_rate != null && last.match_rate >= 0.7;

  return candidates.map((type) => {
    let weight = 1;

    if (fatigueRisk) {
      if (type === "play" || type === "surprise") weight *= 3;
      if (type === "deepen" || type === "memory") weight *= 0.3;
    }

    if (tone === "tense") {
      if (type === "deepen") weight *= 0.3;
      if (type === "connection" || type === "play") weight *= 2;
    }

    if (tone === "warm" || tone === "playful") {
      if (type === "deepen" || type === "surprise") weight *= 1.7;
    }

    if (highEngagement && (type === "deepen" || type === "connection")) {
      weight *= 1.5;
    }

    return { type, weight };
  });
}

function weightedPick(
  weighted: { type: RoundType; weight: number }[]
): RoundType {
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let r = Math.random() * total;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) return w.type;
  }
  return weighted[weighted.length - 1].type;
}

async function selectNextRoundType(
  roomId: string,
  type: ExperienceType,
  lastType: RoundType | null
): Promise<RoundType> {
  if (!lastType) return "discover"; // round 1 always starts here — nothing to deepen/revisit yet

  const { count } = await supabase
    .from("discoveries")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);
  const hasDiscoveries = (count ?? 0) > 0;

  const candidates = ROUND_TYPES.map((r) => r.key)
    .filter((k) => hasDiscoveries || (k !== "deepen" && k !== "memory")) // nothing to deepen/revisit yet
    .filter((k) => k !== lastType); // never repeat the immediately previous type

  const signals = await getRecentSignals(roomId, type);
  const weighted = weightCandidates(candidates, signals);
  return weightedPick(weighted);
}

export type RoundRow = {
  id: string;
  round_number: number;
  round_type: RoundType | null;
  status: "active" | "complete";
};

// Returns the latest round for this room+type, whatever its status.
// Does NOT create one — callers decide what to do with "no round yet"
// or "latest round is complete" themselves.
export async function getLatestRound(
  roomId: string,
  type: ExperienceType
): Promise<RoundRow | null> {
  const { data } = await supabase
    .from("experience_rounds")
    .select("id, round_number, round_type, status")
    .eq("room_id", roomId)
    .eq("type", type)
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RoundRow) ?? null;
}

// Creates the next round (round 1 if none exist yet). Only call this at
// the moment someone actually acts (asks a question) — never eagerly,
// so viewing a page never silently starts a round nobody asked for.
export async function startNextRound(
  roomId: string,
  type: ExperienceType
): Promise<RoundRow> {
  const last = await getLatestRound(roomId, type);
  const nextNumber = (last?.round_number ?? 0) + 1;
  const nextType = await selectNextRoundType(
    roomId,
    type,
    last?.round_type ?? null
  );

  const { data, error } = await supabase
    .from("experience_rounds")
    .insert({
      room_id: roomId,
      type,
      round_number: nextNumber,
      round_type: nextType,
      status: "active",
    })
    .select("id, round_number, round_type, status")
    .single();

  if (error) throw error;
  return data as RoundRow;
}

export async function getRoundProgress(roundId: string) {
  const { data: experiences } = await supabase
    .from("experiences")
    .select("id, options, ai_matched")
    .eq("round_id", roundId);

  const list = experiences ?? [];
  if (list.length === 0) return { completed: 0, matches: 0 };

  const ids = list.map((e: any) => e.id);
  const { data: responses } = await supabase
    .from("responses")
    .select("experience_id, answer, is_prediction")
    .in("experience_id", ids);

  let completed = 0;
  let matches = 0;
  for (const exp of list) {
    const rs = (responses ?? []).filter(
      (r: any) => r.experience_id === (exp as any).id
    );
    if (rs.length < 2) continue;
    completed++;
    const self = rs.find((r: any) => !r.is_prediction);
    const pred = rs.find((r: any) => r.is_prediction);
    if (!self || !pred) continue;
    const hasOptions = !!(exp as any).options && (exp as any).options.length > 0;
    const isMatch = hasOptions
      ? self.answer === pred.answer
      : (exp as any).ai_matched === true;
    if (isMatch) matches++;
  }
  return { completed, matches };
}

// Call after every answer submission. Closes the round the moment it
// hits roundSize — deliberately, not as a punishment, just the natural
// stopping point the round was always going to reach. Fires a
// fire-and-forget signal analysis so the NEXT round's type selection has
// real tone/fatigue data to weigh.
export async function completeRoundIfFull(
  roundId: string,
  roundSize: number = ROUND_SIZE
): Promise<boolean> {
  const progress = await getRoundProgress(roundId);
  if (progress.completed >= roundSize) {
    await supabase
      .from("experience_rounds")
      .update({ status: "complete", completed_at: new Date().toISOString() })
      .eq("id", roundId)
      .eq("status", "active");

    fetch("/api/analyze-round-signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId }),
    }).catch(() => {});

    return true;
  }
  return false;
}

