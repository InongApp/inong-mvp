import { supabaseAdmin } from "@/lib/supabaseAdmin";

// A discovery that's resurfaced multiple times is more central to the
// relationship than one mentioned once and never again. Recency still
// matters, but reinforcement matters more.
export async function getRelevantDiscoveries(
  roomId: string,
  limit = 8
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("discoveries")
    .select("summary, reinforcement_count, last_reinforced_at, created_at")
    .eq("room_id", roomId);

  if (!data || data.length === 0) return [];

  const now = Date.now();
  const scored = data.map((d: any) => {
    const anchor = d.last_reinforced_at ?? d.created_at;
    const daysSince = Math.max(
      0,
      (now - new Date(anchor).getTime()) / (1000 * 60 * 60 * 24)
    );
    const recencyScore = 1 / Math.log(daysSince + 2);
    const score = (d.reinforcement_count ?? 1) * 2 + recencyScore;
    return { summary: d.summary as string, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.summary);
}

