import { supabase } from "@/lib/supabase";

export type OverallStats = {
  totalCompleted: number;
  totalMatches: number;
};

export async function getOverallStats(roomId: string): Promise<OverallStats> {
  const { data: experiences } = await supabase
    .from("experiences")
    .select("id, options, ai_matched")
    .eq("room_id", roomId)
    .in("type", ["know_me", "bet_on_me"]);

  const list = experiences ?? [];
  if (list.length === 0) return { totalCompleted: 0, totalMatches: 0 };

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

  return { totalCompleted: completed, totalMatches: matches };
}

export function verdictFor(matches: number, total: number): string {
  if (total === 0) return "No questions answered yet.";
  const pct = matches / total;
  if (pct >= 0.8) return "You two are seriously in sync. 🔥";
  if (pct >= 0.5) return "Good instincts — there's more to uncover.";
  return "Plenty to learn about each other still — that's the fun part.";
}

