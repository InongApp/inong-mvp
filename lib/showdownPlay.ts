import { supabase } from "@/lib/supabase";
import type { LeagueKey } from "@/lib/leagues";

// Per your chess-clock design: each Pair gets their own 15-minute window
// per question. The clock starts the moment that Pair first loads the
// question and stops the instant BOTH of that Pair's members have
// answered it. Running out forfeits the whole Showdown for that Pair —
// not just the one question — soccer-style, same as the old async
// timeout rule, just triggered on a live clock now instead of 24 hours.
export const QUESTION_TIMEOUT_MINUTES = 15;

export type ShowdownProgress = {
  showdown_id: string;
  room_id: string;
  current_question_number: number;
  question_started_at: string;
  match_count: number;
  completed_at: string | null;
};

export async function getOrInitProgress(
  showdownId: string,
  roomId: string
): Promise<ShowdownProgress> {
  const { data: existing } = await supabase
    .from("showdown_progress")
    .select("*")
    .eq("showdown_id", showdownId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (existing) return existing as ShowdownProgress;

  const { data: created } = await supabase
    .from("showdown_progress")
    .insert({ showdown_id: showdownId, room_id: roomId })
    .select("*")
    .single();
  return created as ShowdownProgress;
}

export function isTimedOut(progress: ShowdownProgress): boolean {
  const startedAt = new Date(progress.question_started_at).getTime();
  const elapsedMinutes = (Date.now() - startedAt) / 1000 / 60;
  return elapsedMinutes > QUESTION_TIMEOUT_MINUTES;
}

export async function submitAnswer(
  showdownQuestionId: string,
  roomId: string,
  profileId: string,
  answer: string
): Promise<void> {
  await supabase.from("showdown_responses").upsert(
    { showdown_question_id: showdownQuestionId, room_id: roomId, profile_id: profileId, answer },
    { onConflict: "showdown_question_id,profile_id" }
  );
}

export async function getResponsesForQuestion(
  showdownQuestionId: string
): Promise<{ profile_id: string; answer: string }[]> {
  const { data } = await supabase
    .from("showdown_responses")
    .select("profile_id, answer")
    .eq("showdown_question_id", showdownQuestionId);
  return data ?? [];
}

// Call after a submission to check whether this Pair just completed the
// current question (both members answered) and, if so, advance them to
// the next one — or mark them done if that was the last question.
export async function tryAdvance(
  showdownId: string,
  roomId: string,
  showdownQuestionId: string,
  totalQuestions: number
): Promise<void> {
  const responses = await getResponsesForQuestion(showdownQuestionId);
  if (responses.length < 2) return; // still waiting on the partner

  const matched = responses[0].answer === responses[1].answer;
  const { data: progress } = await supabase
    .from("showdown_progress")
    .select("current_question_number, match_count")
    .eq("showdown_id", showdownId)
    .eq("room_id", roomId)
    .single();
  if (!progress) return;

  const nextNumber = progress.current_question_number + 1;
  const isDone = nextNumber > totalQuestions;

  await supabase
    .from("showdown_progress")
    .update({
      match_count: progress.match_count + (matched ? 1 : 0),
      current_question_number: nextNumber,
      question_started_at: new Date().toISOString(),
      completed_at: isDone ? new Date().toISOString() : null,
    })
    .eq("showdown_id", showdownId)
    .eq("room_id", roomId);

  if (isDone) await checkAndFinalizeShowdown(showdownId, totalQuestions);
}

export async function forfeitByTimeout(showdownId: string, timedOutRoomId: string): Promise<void> {
  const { data: showdown } = await supabase
    .from("showdowns")
    .select("pair_a_room_id, pair_b_room_id, status")
    .eq("id", showdownId)
    .single();
  if (!showdown || showdown.status !== "active") return;

  const winnerRoomId =
    showdown.pair_a_room_id === timedOutRoomId ? showdown.pair_b_room_id : showdown.pair_a_room_id;

  await supabase
    .from("showdowns")
    .update({
      status: "forfeited",
      ended_reason: "forfeit_timeout",
      winner_room_id: winnerRoomId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", showdownId)
    .eq("status", "active");

  await awardPoints(winnerRoomId, showdown.league_key ?? null, 10, "participation", showdownId);
  await awardPoints(winnerRoomId, showdown.league_key ?? null, 30, "showdown_win", showdownId);
  // The timed-out Pair earns nothing — they didn't finish. Consistent with
  // "the Pair that stayed wins," soccer-style, from the design decisions.
}

async function checkAndFinalizeShowdown(showdownId: string, totalQuestions: number): Promise<void> {
  const { data: showdown } = await supabase
    .from("showdowns")
    .select("pair_a_room_id, pair_b_room_id, league_key, status")
    .eq("id", showdownId)
    .single();
  if (!showdown || showdown.status !== "active") return;

  const { data: progresses } = await supabase
    .from("showdown_progress")
    .select("room_id, match_count, completed_at")
    .eq("showdown_id", showdownId);
  const list = progresses ?? [];
  const a = list.find((p) => p.room_id === showdown.pair_a_room_id);
  const b = list.find((p) => p.room_id === showdown.pair_b_room_id);
  if (!a?.completed_at || !b?.completed_at) return; // still waiting on one side

  let winnerRoomId: string | null = null;
  if (a.match_count > b.match_count) winnerRoomId = a.room_id;
  else if (b.match_count > a.match_count) winnerRoomId = b.room_id;
  // else: a genuine tie — automated sudden-death isn't built yet, so this
  // is surfaced to players as a tie rather than silently guessed at.

  await supabase
    .from("showdowns")
    .update({
      status: "complete",
      ended_reason: "finished",
      winner_room_id: winnerRoomId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", showdownId)
    .eq("status", "active");

  // Everyone who finished gets participation points; only a clear winner
  // gets the +30 bonus. A tie awards no bonus to either side.
  await awardPoints(a.room_id, showdown.league_key ?? null, 10, "participation", showdownId);
  await awardPoints(b.room_id, showdown.league_key ?? null, 10, "participation", showdownId);
  if (winnerRoomId) {
    await awardPoints(winnerRoomId, showdown.league_key ?? null, 30, "showdown_win", showdownId);
  }
}

async function awardPoints(
  roomId: string,
  leagueKey: LeagueKey | null,
  points: number,
  source: "participation" | "showdown_win" | "left_match",
  referenceId: string
): Promise<void> {
  await supabase.from("leaderboard_points").insert({
    room_id: roomId,
    points,
    source,
    reference_id: referenceId,
    league_key_at_time: leagueKey,
  });
}

export type ShowdownResult = {
  status: "active" | "complete" | "forfeited" | "abandoned";
  winner_room_id: string | null;
  pair_a_room_id: string;
  pair_b_room_id: string;
};

export async function getShowdownResult(showdownId: string): Promise<ShowdownResult | null> {
  const { data } = await supabase
    .from("showdowns")
    .select("status, winner_room_id, pair_a_room_id, pair_b_room_id")
    .eq("id", showdownId)
    .maybeSingle();
  return (data as ShowdownResult) ?? null;
}

