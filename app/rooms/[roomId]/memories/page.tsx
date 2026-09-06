"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import CommentThread from "@/components/CommentThread";

type Memory = {
  id: string; // discovery id
  summary: string;
  category: string | null;
  createdAt: string;
  experienceId: string;
  question: string;
  selfAnswer: string | null;
  predictionAnswer: string | null; // for know_me/bet_on_me framing
  type: "know_me" | "bet_on_me";
  roundNumber: number | null;
};

export default function MemoriesPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("your Inong");
  const [memories, setMemories] = useState<Memory[]>([]);
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

    const { data: discoveries } = await supabase
      .from("discoveries")
      .select("id, summary, category, created_at, source_experience_id")
      .eq("room_id", params.roomId)
      .order("created_at", { ascending: false });

    if (!discoveries || discoveries.length === 0) {
      setMemories([]);
      setLoading(false);
      return;
    }

    const expIds = discoveries.map((d: any) => d.source_experience_id);
    const { data: experiences } = await supabase
      .from("experiences")
      .select("id, type, question, experience_rounds(round_number)")
      .in("id", expIds);

    const { data: allResponses } = await supabase
      .from("responses")
      .select("experience_id, answer, is_prediction")
      .in("experience_id", expIds);

    const list: Memory[] = discoveries.map((d: any) => {
      const exp: any = (experiences ?? []).find((e: any) => e.id === d.source_experience_id);
      const rs = (allResponses ?? []).filter(
        (r: any) => r.experience_id === d.source_experience_id
      );
      const self = rs.find((r: any) => !r.is_prediction);
      const pred = rs.find((r: any) => r.is_prediction);

      return {
        id: d.id,
        summary: d.summary,
        category: d.category,
        createdAt: d.created_at,
        experienceId: d.source_experience_id,
        question: exp?.question ?? "",
        selfAnswer: self?.answer ?? null,
        predictionAnswer: pred?.answer ?? null,
        type: exp?.type ?? "know_me",
        roundNumber: exp?.experience_rounds?.round_number ?? null,
      };
    });

    setMemories(list);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading your memories...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => router.back()}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← Back
      </button>

      <h1 className="font-serif mt-4 text-2xl font-semibold">
        Our INONG™ Memories
      </h1>
      <p className="mt-2 text-sm text-mute">
        Revisit what you&rsquo;ve discovered about each other.
      </p>

      {memories.length === 0 && (
        <p className="mt-10 text-center text-mute">
          No memories yet — play a few rounds of Know Me or Bet on Me, and
          what you discover about each other will show up here.
        </p>
      )}

      <div className="mt-6 flex-1 space-y-3">
        {memories.map((m) => {
          const isOpen = openId === m.id;
          return (
            <div key={m.id} className="rounded-card bg-surface px-4 py-4">
              <button
                onClick={() => setOpenId(isOpen ? null : m.id)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-serif text-base text-paper">
                    ✦ {m.summary}
                  </p>
                  <span className="text-lg">❤️</span>
                </div>
                <p className="mt-1 text-xs text-mute">
                  {m.type === "know_me" ? "Know Me" : "Bet on Me"}
                  {m.roundNumber ? ` · Round ${m.roundNumber}` : ""}
                </p>
              </button>

              {isOpen && (
                <div className="mt-3 border-t border-ink/10 pt-3">
                  <p className="text-xs uppercase tracking-wide text-mute">
                    Where this came from
                  </p>
                  <p className="mt-1 text-sm text-paper">{m.question}</p>
                  {m.selfAnswer && (
                    <p className="mt-2 text-sm text-mute">
                      Real answer: <span className="text-paper">{m.selfAnswer}</span>
                      {m.predictionAnswer && (
                        <>
                          {" "}
                          · Guess: <span className="text-paper">{m.predictionAnswer}</span>
                        </>
                      )}
                    </p>
                  )}

                  <p className="mt-4 text-xs uppercase tracking-wide text-mute">
                    Talk about it now
                  </p>
                  <CommentThread
                    experienceId={m.experienceId}
                    userId={userId!}
                    friendName={friendName}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

