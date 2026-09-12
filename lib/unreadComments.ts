import { supabase } from "@/lib/supabase";

async function latestCommentFromOthers(
  idColumn: "experience_id" | "surprise_id" | "inside_joke_id" | "daily_prompt_id",
  ids: string[],
  userId: string
): Promise<string | null> {
  if (ids.length === 0) return null;
  const { data } = await supabase
    .from("experience_comments")
    .select("created_at")
    .in(idColumn, ids)
    .neq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}

function isNewer(latest: string | null, lastRead: string | undefined): boolean {
  if (!latest) return false;
  if (!lastRead) return true;
  return new Date(latest).getTime() > new Date(lastRead).getTime();
}

// Returns the set of experience hrefs that have something new from the
// OTHER person since this user last visited them. Room-level granularity —
// this answers "does Know Me have anything new," not "which exact round."
export async function getUnreadHrefs(roomId: string, userId: string): Promise<Set<string>> {
  const unread = new Set<string>();

  const [{ data: reads }, { data: experiences }, { data: surprises }, { data: jokes }, { data: dailies }] =
    await Promise.all([
      supabase
        .from("comment_reads")
        .select("experience_href, last_read_at")
        .eq("room_id", roomId)
        .eq("profile_id", userId),
      supabase.from("experiences").select("id, type").eq("room_id", roomId),
      supabase.from("surprises").select("id, is_dare").eq("room_id", roomId),
      supabase.from("inside_jokes").select("id").eq("room_id", roomId),
      supabase.from("daily_prompts").select("id").eq("room_id", roomId),
    ]);

  const readMap: Record<string, string> = {};
  (reads ?? []).forEach((r: any) => (readMap[r.experience_href] = r.last_read_at));

  const idsByType = (t: string) =>
    (experiences ?? []).filter((e: any) => e.type === t).map((e: any) => e.id);

  const checks: { href: string; ids: string[]; column: "experience_id" | "surprise_id" | "inside_joke_id" | "daily_prompt_id" }[] = [
    { href: "know-me", ids: idsByType("know_me"), column: "experience_id" },
    { href: "bet-on-me", ids: idsByType("bet_on_me"), column: "experience_id" },
    { href: "visuals-in-words/compare", ids: idsByType("visuals_in_words"), column: "experience_id" },
    { href: "visuals-in-words/guess", ids: idsByType("visuals_guess"), column: "experience_id" },
    { href: "our-thing", ids: (jokes ?? []).map((j: any) => j.id), column: "inside_joke_id" },
    {
      href: "surprise-me/surprise",
      ids: (surprises ?? []).filter((s: any) => !s.is_dare).map((s: any) => s.id),
      column: "surprise_id",
    },
    {
      href: "surprise-me/dare",
      ids: (surprises ?? []).filter((s: any) => s.is_dare).map((s: any) => s.id),
      column: "surprise_id",
    },
    { href: "daily", ids: (dailies ?? []).map((d: any) => d.id), column: "daily_prompt_id" },
  ];

  await Promise.all(
    checks.map(async (c) => {
      const latest = await latestCommentFromOthers(c.column, c.ids, userId);
      if (isNewer(latest, readMap[c.href])) unread.add(c.href);
    })
  );

  // Just Because lives in its own table, not experience_comments
  const { data: latestNote } = await supabase
    .from("just_because_notes")
    .select("created_at")
    .eq("room_id", roomId)
    .neq("sender_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (isNewer(latestNote?.created_at ?? null, readMap["just-because"])) {
    unread.add("just-because");
  }

  return unread;
}

export async function markExperienceRead(roomId: string, userId: string, href: string) {
  await supabase.from("comment_reads").upsert(
    {
      room_id: roomId,
      profile_id: userId,
      experience_href: href,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "room_id,profile_id,experience_href" }
  );
}

