import { supabase } from "@/lib/supabase";

// 5 alternating turns per player = 10 total. This is the finite
// "hanger" unit — deliberate, not a limitation. The Journey (all rounds
// over time) stays open-ended; only the Round is finite.
export const ROUND_SIZE = 10;

export type RoundRow = {
  id: string;
  round_number: number;
  status: "active" | "complete";
};

// Returns the latest round for this room+type, whatever its status.
// Does NOT create one — callers decide what to do with "no round yet"
// or "latest round is complete" themselves.
export async function getLatestRound(
  roomId: string,
  type: "know_me" | "bet_on_me"
): Promise<RoundRow | null> {
  const { data } = await supabase
    .from("experience_rounds")
    .select("id, round_number, status")
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
  type: "know_me" | "bet_on_me"
): Promise<RoundRow> {
  const last = await getLatestRound(roomId, type);
  const nextNumber = (last?.round_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("experience_rounds")
    .insert({
      room_id: roomId,
      type,
      round_number: nextNumber,
      status: "active",
    })
    .select("id, round_number, status")
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
// hits ROUND_SIZE — deliberately, not as a punishment, just the natural
// stopping point the round was always going to reach.
export async function completeRoundIfFull(roundId: string): Promise<boolean> {
  const progress = await getRoundProgress(roundId);
  if (progress.completed >= ROUND_SIZE) {
    await supabase
      .from("experience_rounds")
      .update({ status: "complete", completed_at: new Date().toISOString() })
      .eq("id", roundId)
      .eq("status", "active");
    return true;
  }
  return false;
}

