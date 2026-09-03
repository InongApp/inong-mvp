import { supabase } from "@/lib/supabase";

type ExperienceForMatch = {
  id: string;
  question: string;
  options: string[] | null;
  ai_matched?: boolean | null;
};

export async function resolveMatch(
  experience: ExperienceForMatch,
  selfAnswer: string,
  predictionAnswer: string
): Promise<boolean> {
  // Multiple-choice: exact comparison is correct and sufficient — both
  // people picked from the same identical set of option strings.
  if (experience.options && experience.options.length > 0) {
    return selfAnswer === predictionAnswer;
  }

  // Free-text: use the cached AI judgment if we already have one.
  if (experience.ai_matched !== null && experience.ai_matched !== undefined) {
    return experience.ai_matched;
  }

  // First time this round is complete — ask the AI to judge it once, then
  // cache the result so we never call OpenAI again for this round.
  try {
    const res = await fetch("/api/judge-match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: experience.question,
        selfAnswer,
        predictionAnswer,
      }),
    });
    const data = await res.json();
    const matched = !!data.matched;

    await supabase
      .from("experiences")
      .update({ ai_matched: matched })
      .eq("id", experience.id);

    return matched;
  } catch {
    // If the AI call fails for any reason, fall back to a lenient exact
    // comparison rather than blocking the reveal.
    return (
      selfAnswer.trim().toLowerCase() === predictionAnswer.trim().toLowerCase()
    );
  }
}

