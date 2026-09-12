"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { notify } from "@/lib/notifyClient";

type Note = {
  id: string;
  sender_id: string;
  message: string;
  created_at: string;
};

export default function JustBecausePage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [friendId, setFriendId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("your Inong");
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    load();

    // Real-time delivery: the other person's send appears the moment it
    // lands, no polling delay. Dedup by id, since our own optimistic
    // append (in send()) and this event can both fire for our own message.
    const channel = supabase
      .channel(`just-because-${params.roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "just_because_notes",
          filter: `room_id=eq.${params.roomId}`,
        },
        (payload) => {
          const incoming = payload.new as Note;
          setNotes((prev) =>
            prev.some((n) => n.id === incoming.id) ? prev : [...prev, incoming]
          );
        }
      )
      .subscribe();

    // Slow fallback poll — only a safety net in case a realtime event is
    // ever missed (a brief disconnect, etc.), not the primary delivery path.
    const interval = setInterval(load, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [notes.length]);

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
    const other: any = (memberRows ?? []).find((m: any) => m.profile_id !== session.user.id);
    if (other) {
      setFriendId(other.profile_id);
      setFriendName(other.profiles?.display_name ?? "your Inong");
    }

    const { data } = await supabase
      .from("just_because_notes")
      .select("id, sender_id, message, created_at")
      .eq("room_id", params.roomId)
      .order("created_at", { ascending: true });

    setNotes((data as Note[]) ?? []);
    setLoading(false);
  }

  async function send() {
    if (!userId || sending) return;
    setSending(true);
    const messageToSend = text.trim(); // empty string is a valid, complete send
    try {
      const { data: inserted, error } = await supabase
        .from("just_because_notes")
        .insert({
          room_id: params.roomId,
          sender_id: userId,
          message: messageToSend,
        })
        .select("id, sender_id, message, created_at")
        .single();

      if (!error && inserted) {
        setText("");
        // Optimistic append — don't wait on the realtime round-trip for
        // our own message to show up. The realtime handler dedupes this
        // by id if its event arrives too.
        setNotes((prev) =>
          prev.some((n) => n.id === inserted.id) ? prev : [...prev, inserted as Note]
        );
        if (friendId) {
          notify(
            friendId,
            "💌 Just because",
            messageToSend || "Someone's thinking of you.",
            `/rooms/${params.roomId}/just-because`
          );
        }
      }
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading...
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

      <h1 className="font-serif mt-4 text-xl font-semibold">💌 Just Because</h1>
      <p className="mt-1 text-sm text-mute">
        No round, no score, no reason needed. Say something, or just send the
        heart.
      </p>

      <div className="mt-6 flex-1 space-y-3 overflow-y-auto">
        {notes.length === 0 && (
          <p className="mt-10 text-center text-sm text-mute">
            Nothing here yet — be the first to send one.
          </p>
        )}
        {notes.map((n) => {
          const isMe = n.sender_id === userId;
          return (
            <div
              key={n.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-card px-4 py-3 ${
                  isMe ? "bg-coral text-ink" : "bg-surface text-paper"
                }`}
              >
                <p className="text-sm">{n.message || "❤️"}</p>
                <p
                  className={`mt-1 text-[10px] ${
                    isMe ? "text-ink/60" : "text-mute"
                  }`}
                >
                  {isMe ? "You" : friendName}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something... or leave it blank"
          className="flex-1 rounded-full bg-surface px-4 py-3 text-sm text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
        />
        <button
          onClick={send}
          disabled={sending}
          className="rounded-full bg-coral px-5 py-3 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          ❤️
        </button>
      </div>
    </div>
  );
}

