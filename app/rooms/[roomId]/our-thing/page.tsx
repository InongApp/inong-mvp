"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import CommentThread from "@/components/CommentThread";

type Entry = {
  id: string;
  title: string;
  story: string;
  created_by: string;
  created_at: string;
};

export default function OurThingPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setUserId(session.user.id);

    const { data: memberRows } = await supabase
      .from("room_members")
      .select("profile_id, profiles(display_name)")
      .eq("room_id", params.roomId);
    const nameMap: Record<string, string> = {};
    (memberRows ?? []).forEach((m: any) => {
      nameMap[m.profile_id] = m.profiles?.display_name ?? "Someone";
    });
    setNames(nameMap);

    const { data } = await supabase
      .from("inside_jokes")
      .select("id, title, story, created_by, created_at")
      .eq("room_id", params.roomId)
      .order("created_at", { ascending: false });

    setEntries((data as Entry[]) ?? []);
    setLoading(false);
  }

  async function submit() {
    if (!title.trim() || !story.trim() || !userId) {
      return setError("Give it a name and tell the story.");
    }
    setError(null);
    const { error: insertErr } = await supabase.from("inside_jokes").insert({
      room_id: params.roomId,
      title: title.trim(),
      story: story.trim(),
      created_by: userId,
    });
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setTitle("");
    setStory("");
    setAdding(false);
    load();
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading your Thing...
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
        Our INONG™ Thing
      </h1>
      <p className="mt-2 text-sm text-mute">
        Your private language — jokes, nicknames, stories only the two of
        you would get. Add to it anytime.
      </p>

      {adding ? (
        <div className="mt-6 flex flex-col">
          <label className="text-xs uppercase tracking-wide text-mute">
            What is it?
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Blue Chair"
            className="mt-1 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
          />
          <label className="mt-4 text-xs uppercase tracking-wide text-mute">
            The story behind it
          </label>
          <textarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="Tell it like you'd tell a friend..."
            rows={4}
            className="mt-1 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
          />
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setAdding(false)}
              className="flex-1 rounded-full border border-mute py-3 text-sm text-paper hover:border-paper"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              className="flex-1 rounded-full bg-coral py-3 text-sm font-medium text-ink hover:opacity-90"
            >
              Save it
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-coral">{error}</p>}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-6 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
        >
          + Add something
        </button>
      )}

      {entries.length === 0 && !adding && (
        <p className="mt-10 text-center text-mute">
          Nothing here yet — add your first inside joke or story above.
        </p>
      )}

      <div className="mt-6 flex-1 space-y-2">
        {entries.map((entry) => {
          const isOpen = openId === entry.id;
          return (
            <div key={entry.id} className="rounded-card bg-surface px-4 py-4">
              <button
                onClick={() => setOpenId(isOpen ? null : entry.id)}
                className="w-full text-left"
              >
                <p className="font-serif text-base text-paper">
                  ✦ {entry.title}
                </p>
                <p className="mt-1 text-xs text-mute">
                  Added by {names[entry.created_by] ?? "Someone"}
                </p>
              </button>
              {isOpen && (
                <div className="mt-3 border-t border-ink/10 pt-3">
                  <p className="text-sm text-paper">{entry.story}</p>
                  {userId && (
                    <CommentThread
                      insideJokeId={entry.id}
                      userId={userId}
                      friendName={
                        Object.entries(names).find(([id]) => id !== userId)?.[1] ??
                        "your Inong"
                      }
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

