"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { QUICK_EMOJIS } from "@/lib/quickEmojis";

type Comment = { id: string; profile_id: string; message: string };

export default function CommentThread({
  experienceId,
  surpriseId,
  insideJokeId,
  dailyPromptId,
  userId,
  friendName,
}: {
  experienceId?: string;
  surpriseId?: string;
  insideJokeId?: string;
  dailyPromptId?: string;
  userId: string;
  friendName: string;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const column = experienceId
    ? "experience_id"
    : surpriseId
    ? "surprise_id"
    : insideJokeId
    ? "inside_joke_id"
    : "daily_prompt_id";
  const subjectId = experienceId ?? surpriseId ?? insideJokeId ?? dailyPromptId;

  useEffect(() => {
    if (!subjectId) return;
    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  async function load() {
    if (!subjectId) return;
    const { data } = await supabase
      .from("experience_comments")
      .select("id, profile_id, message")
      .eq(column, subjectId)
      .order("created_at", { ascending: true });
    setComments(data ?? []);
  }

  async function send(override?: string) {
    const message = (override ?? text).trim();
    if (!message || !subjectId) return;
    setSending(true);
    await supabase.from("experience_comments").insert({
      [column]: subjectId,
      profile_id: userId,
      message,
    });
    if (!override) setText("");
    setSending(false);
    load();
  }

  if (!subjectId) return null;

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
      <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => send(emoji)}
            disabled={sending}
            className="shrink-0 rounded-full bg-surface px-2.5 py-1.5 text-lg transition hover:bg-surface/70 disabled:opacity-50"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={`Say something to ${friendName}...`}
          className="flex-1 rounded-full bg-surface px-4 py-2 text-sm text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
        />
        <button
          onClick={() => send()}
          disabled={sending || !text.trim()}
          className="rounded-full bg-coral px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

