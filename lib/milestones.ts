import { supabase } from "@/lib/supabase";

const ROUND_MILESTONES = [5, 10, 25, 50, 100];

async function hasMilestoneBeenSeen(roomId: string, key: string): Promise<boolean> {
  const { data } = await supabase
    .from("milestones_seen")
    .select("id")
    .eq("room_id", roomId)
    .eq("milestone_key", key)
    .maybeSingle();
  return !!data;
}

export async function markMilestoneSeen(roomId: string, key: string) {
  // Unique constraint on (room_id, milestone_key) makes this safe to call
  // even if two tabs race — the loser's insert just fails silently.
  await supabase.from("milestones_seen").insert({ room_id: roomId, milestone_key: key });
}

// A round hitting 5, 10, 25, 50, or 100 is worth marking — "something to
// point back to," not just another completed round like all the others.
export async function checkRoundMilestone(
  roomId: string,
  experienceType: string,
  roundNumber: number
): Promise<{ key: string; label: string } | null> {
  if (!ROUND_MILESTONES.includes(roundNumber)) return null;
  const key = `${experienceType}-round-${roundNumber}`;
  const seen = await hasMilestoneBeenSeen(roomId, key);
  if (seen) return null;
  return { key, label: `Round ${roundNumber} together` };
}

// Checked from highest threshold down — shows the most advanced milestone
// actually reached, never retroactively spamming lower ones once a higher
// one is already true.
export async function checkRoomAgeMilestone(
  roomId: string,
  createdAt: string
): Promise<{ key: string; label: string } | null> {
  const days = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const candidates = [
    { threshold: 365, key: "room-age-365d", label: "One year on INONG™ 🎉" },
    { threshold: 100, key: "room-age-100d", label: "100 days together on INONG™" },
    { threshold: 30, key: "room-age-30d", label: "One month on INONG™" },
  ];
  for (const c of candidates) {
    if (days >= c.threshold) {
      const seen = await hasMilestoneBeenSeen(roomId, c.key);
      if (!seen) return c;
    }
  }
  return null;
}

