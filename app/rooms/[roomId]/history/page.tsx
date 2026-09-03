"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getOverallStats, verdictFor, DAY_QUESTION_LIMIT } from "@/lib/roomStats";
import CommentThread from "@/components/CommentThread";

type HistoryEntry = {
  id: string;
  type: "know_me" | "bet_on_me";
  question: string;
  createdAt: string;
  selfAnswer: string | null;
  predictionAnswer: string | null;
  matched: boolean;
};

export default function HistoryPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("your Inong");
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [overall, setOverall] = useState({ totalCompleted: 0, totalMatches: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace("/login");
      return;
    }
    const uid = session.user.id;
    setUserId(uid);

    const { data: memberRows } = await supabase
      .from("room_members")
      .select("profile_id, profiles(display_name)")
      .eq("room_id", params.roomId);
    const other: any = (memberRows ?? []).find((m: any) => m.profile_id !== uid);
    if (other) setFriendName(other.profiles?.display_name ?? "your Inong");

    const { data: experiences } = await supabase
      .from("experiences")
      .select("id, type, question, created_by, created_at")
      .eq("room_id", params.roomId)
      .in("type", ["know_me", "bet_on_me"])
      .order("created_at", { ascending: false });

    const ids = (experiences ?? []).map((e: any) => e.id);
    const { data: allResponses } =
      ids.length > 0
        ? await supabase
            .from("responses")
            .select("experience_id, profile_id, answer, is_prediction")
            .in("experience_id", ids)
        : { data: [] };

    const list: HistoryEntry[] = [];
    for (const e of experiences ?? []) {
      const rs = (allResponses ?? []).filter((r: any) => r.experience_id === e.id);
      if (rs.length < 2) continue; // only show completed rounds
      const self = rs.find((r: any) => !r.is_prediction);
      const pred = rs.find((r: any) => r.is_prediction);
      list.push({
        id: e.id,
        type: e.type,
        question: e.question,
        createdAt: e.created_at,
        selfAnswer: self?.answer ?? null,
        predictionAnswer: pred?.answer ?? null,
        matched: !!self && !!pred && self.answer === pred.answer,
      });
    }
    setEntries(list);

    const stats = await getOverallStats(params.roomId);
    setOverall(stats);

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading history...
      </div>
    );
  }

  // Group by calendar day
  const groups: { day: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const day = new Date(entry.createdAt).toDateString();
    let group = groups.find((g) => g.day === day);
    if (!group) {
      group = { day, entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => router.back()}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← Back
      </button>

      <h1 className="font-serif mt-4 text-2xl font-semibold">History & Score</h1>

      <div className="mt-4 rounded-card bg-surface px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-mute">All-time</p>
        <p className="font-serif mt-1 text-2xl text-coral">
          {overall.totalMatches}/{overall.totalCompleted} matched
        </p>
      </div>

      {entries.length === 0 && (
        <p className="mt-8 text-center text-mute">
          No completed questions yet — answer your first one to start your
          history.
        </p>
      )}

      <div className="mt-6 flex-1 space-y-6">
        {groups.map((group) => {
          const dayMatches = group.entries.filter((e) => e.matched).length;
          const dayTotal = group.entries.length;
          const isFullDay = dayTotal >= DAY_QUESTION_LIMIT;

          return (
            <div key={group.day}>
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-mute">
                  {group.day}
                </p>
                <p className="text-xs text-mute">
                  {dayMatches}/{dayTotal}
                  {isFullDay ? " · Day complete" : ""}
                </p>
              </div>
              {isFullDay && (
                <p className="mt-1 text-sm text-coral">
                  {verdictFor(dayMatches, dayTotal)}
                </p>
              )}

              <div className="mt-3 space-y-2">
                {group.entries.map((entry) => (
                  <div key={entry.id} className="rounded-card bg-surface px-4 py-3">
                    <button
                      onClick={() =>
                        setOpenId(openId === entry.id ? null : entry.id)
                      }
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-paper">{entry.question}</p>
                        <span className="text-lg">
                          {entry.matched ? "❤️" : "😂"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-mute">
                        {entry.type === "know_me" ? "Know Me" : "Bet on Me"} ·{" "}
                        {entry.selfAnswer} vs {entry.predictionAnswer}
                      </p>
                    </button>

                    {openId === entry.id && (
                      <CommentThread
                        experienceId={entry.id}
                        userId={userId!}
                        friendName={friendName}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

