import { supabase } from "@/lib/supabase";
import type { LeagueKey } from "@/lib/leagues";

// A "loose window" rather than an exact time — this is the first feature
// in INONG that needs two people online at once, so we deliberately don't
// force calendar-app rigidity onto it. A window just sets expectations;
// the real trigger is both sides tapping "I'm ready" within it.
export type WindowLabel =
  | "now"
  | "later_today"
  | "tonight"
  | "tomorrow"
  | "weekend";

export const WINDOW_LABELS: { key: WindowLabel; label: string }[] = [
  { key: "now", label: "Right now" },
  { key: "later_today", label: "Later today" },
  { key: "tonight", label: "Tonight" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekend", label: "This weekend" },
];

export function windowLabelText(key: WindowLabel | null): string {
  return WINDOW_LABELS.find((w) => w.key === key)?.label ?? "Unscheduled";
}

export type ChallengeStatus =
  | "pending_accept" // invite sent, nobody's attached their Pair yet
  | "awaiting_ready" // both Pairs attached, waiting on one or both "I'm ready" taps
  | "ready_to_start" // both ready — the actual Showdown can begin (next build step)
  | "expired"
  | "cancelled";

export type Challenge = {
  id: string;
  invite_code: string;
  challenger_room_id: string;
  challenged_room_id: string | null;
  league_key: LeagueKey | null;
  window_label: WindowLabel;
  status: ChallengeStatus;
  challenger_ready_at: string | null;
  challenged_ready_at: string | null;
  created_at: string;
  expires_at: string;
};

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// Generous flat expiry rather than trying to map each window label to a
// precise calendar boundary — simpler, and always outlasts what the
// window itself implies, so it never expires while still "current."
const EXPIRY_HOURS = 48;

export async function createChallenge(
  challengerRoomId: string,
  leagueKey: LeagueKey | null,
  windowLabel: WindowLabel
): Promise<{ code: string } | null> {
  let lastErr: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    const expiresAt = new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("showdown_challenges").insert({
      invite_code: code,
      challenger_room_id: challengerRoomId,
      league_key: leagueKey,
      window_label: windowLabel,
      status: "pending_accept",
      expires_at: expiresAt,
    });
    if (!error) return { code };
    lastErr = error;
    if (!error.message?.toLowerCase().includes("duplicate")) break;
  }
  console.error("createChallenge failed:", lastErr);
  return null;
}

export async function getChallengeByCode(code: string): Promise<Challenge | null> {
  const { data } = await supabase
    .from("showdown_challenges")
    .select("*")
    .eq("invite_code", code.toUpperCase())
    .maybeSingle();
  return (data as Challenge) ?? null;
}

export async function acceptChallenge(
  challengeId: string,
  challengedRoomId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("showdown_challenges")
    .update({ challenged_room_id: challengedRoomId, status: "awaiting_ready" })
    .eq("id", challengeId)
    .eq("status", "pending_accept"); // can't accept twice
  return !error;
}

// Marks one side ready; if both are now ready, flips status to ready_to_start.
export async function markReady(
  challengeId: string,
  side: "challenger" | "challenged"
): Promise<boolean> {
  const column = side === "challenger" ? "challenger_ready_at" : "challenged_ready_at";
  const { data: updated, error } = await supabase
    .from("showdown_challenges")
    .update({ [column]: new Date().toISOString() })
    .eq("id", challengeId)
    .select("challenger_ready_at, challenged_ready_at")
    .single();
  if (error || !updated) return false;

  if (updated.challenger_ready_at && updated.challenged_ready_at) {
    await supabase
      .from("showdown_challenges")
      .update({ status: "ready_to_start" })
      .eq("id", challengeId)
      .eq("status", "awaiting_ready");
  }
  return true;
}

export async function getChallengesForRoom(roomId: string): Promise<Challenge[]> {
  const { data } = await supabase
    .from("showdown_challenges")
    .select("*")
    .or(`challenger_room_id.eq.${roomId},challenged_room_id.eq.${roomId}`)
    .neq("status", "expired")
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });
  return (data as Challenge[]) ?? [];
}

