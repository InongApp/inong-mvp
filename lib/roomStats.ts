import { supabase } from "@/lib/supabase";

export const DAY_QUESTION_LIMIT = 10;

export type DayProgress = {
  completedToday: number;
  matchesToday: number;
  capped: boolean;
};

export type OverallStats = {
  totalCompleted: number;
  totalMatches: number;
};

type ExperienceMeta = {
  id: string;
  options: string[] | null;
  ai_matched: boolean | null;
};

async function fetchMatchCounts(experiences: ExperienceMeta[]) {
  if (experiences.length === 0) return { completed: 0, matches: 0 };

  const ids = experiences.map((e) => e.id);
  const { data: responses } = await supabase
    .from("responses")
    .select("experience_id, answer, is_prediction")
    .in("experience_id", ids);

  let completed = 0;
  let matches = 0;

  for (const exp of experiences) {
    const rs = (responses ?? []).filter(
      (r: any) => r.experience_id === exp.id
    );
    if (rs.length < 2) continue;
    completed++;

    const self = rs.find((r: any) => !r.is_prediction);
    const pred = rs.find((r: any) => r.is_prediction);
    if (!self || !pred) continue;

    const hasOptions = !!exp.options && exp.options.length > 0;
    const isMatch = hasOptions
      ? self.answer === pred.answer
      : exp.ai_matched === true;

    if (isMatch) matches++;
  }

  return { completed, matches };
}

export async function getDayProgress(
  roomId: string,
  type: "know_me" | "bet_on_me"
): Promise<DayProgress> {
  const { data: experiences } = await supabase
    .from("experiences")
    .select("id, created_at, options, ai_matched")
    .eq("room_id", roomId)
    .eq("type", type);

  const todayStr = new Date().toDateString();
  const todays = (experiences ?? []).filter(
    (e: any) => new Date(e.created_at).toDateString() === todayStr
  );

  const { completed, matches } = await fetchMatchCounts(todays as any);

  return {
    completedToday: completed,
    matchesToday: matches,
    capped: completed >= DAY_QUESTION_LIMIT,
  };
}

export async function getOverallStats(roomId: string): Promise<OverallStats> {
  const { data: experiences } = await supabase
    .from("experiences")
    .select("id, options, ai_matched")
    .eq("room_id", roomId)
    .in("type", ["know_me", "bet_on_me"]);

  const { completed, matches } = await fetchMatchCounts(
    (experiences ?? []) as any
  );

  return { totalCompleted: completed, totalMatches: matches };
}

export function verdictFor(matches: number, total: number): string {
  if (total === 0) return "No questions answered yet today.";
  const pct = matches / total;
  if (pct >= 0.8) return "You two are seriously in sync. 🔥";
  if (pct >= 0.5) return "Good instincts — there's more to uncover.";
  return "Plenty to learn about each other still — that's the fun part.";
}

