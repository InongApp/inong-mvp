import { RelationshipMode, RomanticStage, ROMANTIC_STAGES } from "@/lib/relationshipMode";

// A League is the comparability bucket a Pair competes within — 8 total.
// The 6 romantic stages are already modeled as RomanticStage; Soulmate and
// Friendship each get one single League of their own for now (no stage
// subdivision yet — that can grow later without breaking anything here).
export type LeagueKey =
  | Exclude<RomanticStage, null>
  | "soulmate"
  | "friendship";

export const LEAGUES: { key: LeagueKey; label: string }[] = [
  ...ROMANTIC_STAGES.map((s) => ({ key: s.key, label: s.label })),
  { key: "soulmate", label: "Soulmate" },
  { key: "friendship", label: "Friendship" },
];

export function leagueLabel(key: LeagueKey | null): string {
  return LEAGUES.find((l) => l.key === key)?.label ?? "Unclassified";
}

export function leagueToModeStage(
  key: LeagueKey | null
): { mode: "romantic" | "soulmate" | "friendship" | null; stage: Exclude<RomanticStage, null> | null } {
  if (!key) return { mode: null, stage: null };
  if (key === "soulmate") return { mode: "soulmate", stage: null };
  if (key === "friendship") return { mode: "friendship", stage: null };
  return { mode: "romantic", stage: key };
}

// Derives a Room's League from its existing relationship_mode/romantic_stage.
// Returns null if not yet determinable (e.g. romantic with no stage chosen
// yet) — callers should treat null as "League not yet set."
export function deriveLeagueKey(
  mode: RelationshipMode,
  stage: RomanticStage
): LeagueKey | null {
  if (mode === "soulmate") return "soulmate";
  if (mode === "friendship") return "friendship";
  if (mode === "romantic") return stage ?? null;
  return null;
}

