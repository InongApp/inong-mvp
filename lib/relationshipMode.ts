export type RelationshipMode = "romantic" | "soulmate" | "friendship" | null;

// Injected into AI system prompts wherever a room's relationship_mode is
// known. This is the mechanism that keeps INONG's actual content true to
// the original proverb — "romantic, or just as easily a soulmate, a
// confidant, or a platonic friendship" — even in phases where marketing
// leads with couples content. Null/legacy rooms default to friendship:
// the safest, most neutral reading, never assumed romantic.
export function relationshipModeInstruction(mode: RelationshipMode): string {
  switch (mode) {
    case "romantic":
      return "This is a ROMANTIC relationship (partners, dating, married, or engaged). Questions can explore romance, attraction, shared future, affection, and romantic history where it fits naturally — but don't force romance into every single question.";
    case "soulmate":
      return "This is a SOULMATE-level bond — profound and deep, but NOT necessarily romantic (it could be, but treat it as an open question, never assumed). Lean into identity, values, life philosophy, and the kind of understanding that goes beneath the surface. Avoid romantic or flirtatious framing unless the question is genuinely neutral to it.";
    case "friendship":
    default:
      return "This is a PLATONIC FRIENDSHIP (close friends, or family-like closeness) — not romantic. Lean into shared history, loyalty, fun, trust, and platonic care. Never use romantic or flirtatious framing — keep it warm and close without implying romance.";
  }
}

