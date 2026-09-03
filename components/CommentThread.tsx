"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Comment = { id: string; profile_id: string; message: string };

export default function CommentThread({
  experienceId,
  userId,
  friendName,
}: {
  experienceId: string;
  userId: string;
  friendName: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experienceId]);

  async function load() {
    const { data } = await supabase
      .from("experience_comments")
      .select("id, profile_id, message")
      .eq("experience_id", experienceId)
      .order("created_at", { ascending: true });
    setComments(data ?? []);
  }

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    await supabase.from("experience_comments").insert({
      experience_id: experienceId,
      profile_id: userId,
      message: text.trim(),
    });
    setText("");
    setSending(false);
    load();
  }

  return (
    <div className="mt-6 w-full">
      {comments.length > 0 && (
        <div className="mb-3 max-h-40 space-y-2 overflow-y-auto">
          {comments.map((c) => (
            <div
              key={c.id}
              className={`rounded-card px-3 py-2 text-sm ${
                c.profile_id === userId
                  ? "ml-8 bg-coral text-ink"
                  : "mr-8 bg-surface text-paper"
              }`}
            >
              {c.message}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Say something to ${friendName}...`}
          className="flex-1 rounded-full bg-surface px-4 py-2 text-sm text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          className="rounded-full bg-coral px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

