import { supabase } from "@/lib/supabase";
import type { LeagueKey } from "@/lib/leagues";
import type { Challenge } from "@/lib/showdownChallenges";

export type ShowdownStatus = "active" | "complete" | "forfeited" | "abandoned";

export type Showdown = {
  id: string;
  challenge_id: string;
  pair_a_room_id: string;
  pair_b_room_id: string;
  league_key: LeagueKey | null;
  status: ShowdownStatus;
  winner_room_id: string | null;
  ended_reason: "finished" | "forfeit_timeout" | "left_match" | null;
  is_tie_decider: boolean;
  started_at: string;
  completed_at: string | null;
};

// Turns a ready_to_start Challenge into a real, playable Showdown: fetches
// a fresh neutral question set from the AI, writes the showdowns +
// showdown_questions rows, and links the challenge to it. Whoever calls
// this first "wins" the race — the challenge update is conditioned on
// still being ready_to_start, so a near-simultaneous second call from the
// other Pair's device harmlessly no-ops instead of creating a duplicate.
export async function startShowdownFromChallenge(
  challenge: Challenge
): Promise<string | null> {
  if (challenge.status !== "ready_to_start" || !challenge.challenged_room_id) {
    return null;
  }

  const res = await fetch("/api/generate-showdown-questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leagueKey: challenge.league_key }),
  });
  if (!res.ok) return null;
  const { questions } = await res.json();
  if (!Array.isArray(questions) || questions.length === 0) return null;

  const { data: showdown, error: showdownErr } = await supabase
    .from("showdowns")
    .insert({
      challenge_id: challenge.id,
      pair_a_room_id: challenge.challenger_room_id,
      pair_b_room_id: challenge.challenged_room_id,
      league_key: challenge.league_key,
      status: "active",
    })
    .select("id")
    .single();
  if (showdownErr || !showdown) return null;

  // Alternate who's the "subject" per question, same convention Know Me
  // already uses — never lets one side answer every question about
  // themselves while the other only ever predicts.
  const questionRows = questions.map((q: any, i: number) => ({
    showdown_id: showdown.id,
    question_number: i + 1,
    question: q.question,
    options: q.options,
    subject_side: i % 2 === 0 ? "pair_a" : "pair_b",
  }));
  const { error: qErr } = await supabase.from("showdown_questions").insert(questionRows);
  if (qErr) return null;

  const { error: linkErr } = await supabase
    .from("showdown_challenges")
    .update({ status: "in_progress", showdown_id: showdown.id })
    .eq("id", challenge.id)
    .eq("status", "ready_to_start"); // the race-condition guard described above
  if (linkErr) return null;

  return showdown.id as string;
}

export async function getShowdown(showdownId: string): Promise<Showdown | null> {
  const { data } = await supabase
    .from("showdowns")
    .select("*")
    .eq("id", showdownId)
    .maybeSingle();
  return (data as Showdown) ?? null;
}

export type ShowdownQuestion = {
  id: string;
  question_number: number;
  question: string;
  options: string[];
  subject_side: "pair_a" | "pair_b";
};

export async function getShowdownQuestions(showdownId: string): Promise<ShowdownQuestion[]> {
  const { data } = await supabase
    .from("showdown_questions")
    .select("id, question_number, question, options, subject_side")
    .eq("showdown_id", showdownId)
    .order("question_number", { ascending: true });
  return (data as ShowdownQuestion[]) ?? [];
}

