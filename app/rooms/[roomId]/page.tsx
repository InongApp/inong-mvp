"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Member = { profile_id: string; display_name: string };
type Room = {
  id: string;
  name: string | null;
  type: "one_on_one" | "inner_circle" | "family";
  max_members: number | null;
};

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [startingWith, setStartingWith] = useState<string | null>(null);

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

    const { data: roomData, error: roomErr } = await supabase
      .from("rooms")
      .select("id, name, type, max_members")
      .eq("id", params.roomId)
      .single();

    if (roomErr || !roomData) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setRoom(roomData as Room);

    const { data: memberRows } = await supabase
      .from("room_members")
      .select("profile_id, profiles(display_name)")
      .eq("room_id", params.roomId);

    const list: Member[] = (memberRows ?? []).map((m: any) => ({
      profile_id: m.profile_id,
      display_name: m.profiles?.display_name ?? "Someone",
    }));
    setMembers(list);
    setLoading(false);
  }

  async function generateInvite() {
    if (!userId || !room) return;
    setError(null);
    try {
      let lastErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = randomCode();
        const { error: inviteErr } = await supabase.from("room_invites").insert({
          room_id: room.id,
          invite_code: code,
          created_by: userId,
        });
        if (!inviteErr) {
          setInviteLink(`${window.location.origin}/join/${code}`);
          return;
        }
        lastErr = inviteErr;
        if (!inviteErr.message?.toLowerCase().includes("duplicate")) break;
      }
      throw lastErr ?? new Error("Couldn't generate an invite — try again.");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    }
  }

  async function startOneOnOne(otherId: string) {
    if (!userId) return;
    setStartingWith(otherId);
    setError(null);
    try {
      const { data: newRoom, error: roomErr } = await supabase
        .from("rooms")
        .insert({
          type: "one_on_one",
          name: null,
          max_members: 2,
          created_by: userId,
        })
        .select()
        .single();
      if (roomErr) throw roomErr;

      const { error: memberErr } = await supabase
        .from("room_members")
        .insert({ room_id: newRoom.id, profile_id: userId });
      if (memberErr) throw memberErr;

      router.push(`/rooms/${newRoom.id}`);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setStartingWith(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading room...
      </div>
    );
  }

  if (notFound || !room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-mute">
          This room doesn&rsquo;t exist, or you&rsquo;re not a member of it.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 rounded-full bg-coral px-6 py-3 font-medium text-ink transition hover:opacity-90"
        >
          Go home
        </button>
      </div>
    );
  }

  const isFull = room.max_members !== null && members.length >= room.max_members;
  const partner =
    room.type === "one_on_one"
      ? members.find((m) => m.profile_id !== userId)
      : null;
  const roomTitle =
    room.type === "one_on_one"
      ? partner
        ? partner.display_name
        : "Waiting for your Inong"
      : room.name;
  const typeLabel =
    room.type === "one_on_one"
      ? "One-on-One"
      : room.type === "inner_circle"
      ? "Inner Circle"
      : "Family";

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => router.push("/")}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← All rooms
      </button>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-mute">{typeLabel}</p>
          <h1 className="font-serif text-2xl font-semibold">{roomTitle}</h1>
        </div>
        <button
          onClick={() => router.push(`/rooms/${room.id}/history`)}
          className="text-xs text-mute hover:text-paper"
        >
          History & Score
        </button>
      </div>

      {members.length > 0 && (
        <div className="mt-6 space-y-2">
          {members.map((m) => (
            <div
              key={m.profile_id}
              className="flex items-center justify-between rounded-card bg-surface px-4 py-3"
            >
              <span className="text-paper">
                {m.display_name}
                {m.profile_id === userId ? " (you)" : ""}
              </span>
              {room.type !== "one_on_one" && m.profile_id !== userId && (
                <button
                  onClick={() => startOneOnOne(m.profile_id)}
                  disabled={startingWith === m.profile_id}
                  className="text-xs text-coral hover:underline"
                >
                  {startingWith === m.profile_id ? "..." : "Start one-on-one"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {room.type === "one_on_one" && members.length === 2 && (
        <div className="mt-8 space-y-3">
          <button
            onClick={() => router.push(`/rooms/${room.id}/know-me`)}
            className="w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
          >
            🧠 Know Me
          </button>
          <button
            onClick={() => router.push(`/rooms/${room.id}/bet-on-me`)}
            className="w-full rounded-full border border-skyblue py-4 font-medium text-skyblue transition hover:bg-skyblue hover:text-ink"
          >
            🎯 Bet on Me
          </button>
          <button
            onClick={() => router.push(`/rooms/${room.id}/memories`)}
            className="w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
          >
            🕰️ Our Memories
          </button>
        </div>
      )}

      {room.type !== "one_on_one" && (
        <p className="mt-8 text-sm text-mute">
          Group experiences (Our Thing, Friend Court, and more) are coming
          soon — for now, start a one-on-one with anyone in this room above.
        </p>
      )}

      {!isFull && (
        <div className="mt-10">
          {inviteLink ? (
            <>
              <p className="text-sm uppercase tracking-wide text-mute">
                Share this invite link
              </p>
              <div className="mt-2 break-all rounded-card bg-surface px-4 py-4 text-sm text-paper">
                {inviteLink}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="mt-3 rounded-full border border-mute px-5 py-2 text-sm text-paper transition hover:border-paper"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </>
          ) : (
            <button
              onClick={generateInvite}
              className="w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
            >
              Invite someone to this room
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-coral">{error}</p>}
    </div>
  );
}

