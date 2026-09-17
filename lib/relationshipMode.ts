export type RelationshipMode = "romantic" | "soulmate" | "friendship" | null;

export type RomanticStage =
  | "courting"
  | "engaged"
  | "newlywed"
  | "child_raising"
  | "balancing"
  | "long_married"
  | null;

export const ROMANTIC_STAGES: {
  key: Exclude<RomanticStage, null>;
  label: string;
  tension: string;
}[] = [
  {
    key: "courting",
    label: "Courting",
    tension:
      "Still performing your best self; uncertainty about where you stand; overthinking their texts.",
  },
  {
    key: "engaged",
    label: "Engaged / Pre-Marriage",
    tension:
      "Merging lives and families; discovering incompatible habits before it's \"too late\" to notice.",
  },
  {
    key: "newlywed",
    label: "Newlywed",
    tension:
      "Honeymoon fading into routine; first real conflicts; learning who they actually are day-to-day.",
  },
  {
    key: "child_raising",
    label: "Child-Raising",
    tension:
      "Identity shift from lovers to co-parents; touch and attention rerouted to kids; exhaustion.",
  },
  {
    key: "balancing",
    label: "Balancing Spouse / Kids / Career",
    tension:
      "Time scarcity; feeling like teammates running logistics instead of partners; resentment from invisible labor.",
  },
  {
    key: "long_married",
    label: "Long-Married / Rediscovery",
    tension:
      "Comfortable but quiet; different love languages never named; a good relationship gone quiet.",
  },
];

function stageInstruction(stage: RomanticStage): string {
  const found = ROMANTIC_STAGES.find((s) => s.key === stage);
  if (!found) return "";
  return ` They are specifically in the ${found.label.toUpperCase()} stage — the core tension to mine here is: ${found.tension} Let this shape the SPECIFIC content of the question, not just the general romantic framing.`;
}

// Injected into AI system prompts wherever a room's relationship_mode is
// known. This is the mechanism that keeps INONG's actual content true to
// the original proverb — "romantic, or just as easily a soulmate, a
// confidant, or a platonic friendship" — even in phases where marketing
// leads with couples content. Null/legacy rooms default to friendship:
// the safest, most neutral reading, never assumed romantic.
//
// When mode is "romantic", an optional stage further sharpens the tension
// the question should mine — courting is a different emotional register
// than long-married rediscovery, even though both are romantic.
export function relationshipModeInstruction(
  mode: RelationshipMode,
  stage: RomanticStage = null
): string {
  switch (mode) {
    case "romantic":
      return `This is a ROMANTIC relationship (partners, dating, married, or engaged). Questions can explore romance, attraction, shared future, affection, and romantic history where it fits naturally — but don't force romance into every single question.${stageInstruction(
        stage
      )}`;
    case "soulmate":
      return "This is a SOULMATE-level bond — profound and deep, but NOT necessarily romantic (it could be, but treat it as an open question, never assumed). Lean into identity, values, life philosophy, and the kind of understanding that goes beneath the surface. Avoid romantic or flirtatious framing unless the question is genuinely neutral to it.";
    case "friendship":
    default:
      return "This is a PLATONIC FRIENDSHIP (close friends, or family-like closeness) — not romantic. Lean into shared history, loyalty, fun, trust, and platonic care. Never use romantic or flirtatious framing — keep it warm and close without implying romance.";
  }
}
