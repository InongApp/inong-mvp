"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RoomType = "one_on_one" | "inner_circle" | "family";

const ROOM_TYPES: {
  type: RoomType;
  label: string;
  blurb: string;
  maxMembers: number | null;
}[] = [
  {
    type: "one_on_one",
    label: "One-on-One",
    blurb: "Just you and one other Inong.",
    maxMembers: 2,
  },
  {
    type: "inner_circle",
    label: "Inner Circle",
    blurb: "Up to 12 close people, plus you.",
    maxMembers: 13,
  },
  {
    type: "family",
    label: "Family",
    blurb: "Unlimited members.",
    maxMembers: null,
  },
];

export default function NewRoomPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [type, setType] = useState<RoomType | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session?.user) {
        router.replace("/login");
        return;
      }
      setUserId(data.session.user.id);
      setChecking(false);
    });
  }, [router]);

  async function handleCreate() {
    if (!userId || !type) return;
    if (type !== "one_on_one" && !name.trim()) {
      return setError("Give this group a name.");
    }
    setLoading(true);
    setError(null);
    try {
      const meta = ROOM_TYPES.find((r) => r.type === type)!;
      const { data: room, error: roomErr } = await supabase
        .from("rooms")
        .insert({
          type,
          name: type === "one_on_one" ? null : name.trim(),
          max_members: meta.maxMembers,
          created_by: userId,
        })
        .select()
        .single();
      if (roomErr) throw roomErr;

      const { error: memberErr } = await supabase
        .from("room_members")
        .insert({ room_id: room.id, profile_id: userId });
      if (memberErr) throw memberErr;

      router.push(`/rooms/${room.id}`);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Checking your account...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => (type ? setType(null) : router.push("/"))}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← Back
      </button>

      <div className="flex flex-1 flex-col justify-center">
        {!type && (
          <>
            <h1 className="font-serif text-2xl font-semibold">
              What kind of room?
            </h1>
            <div className="mt-8 space-y-3">
              {ROOM_TYPES.map((r) => (
                <button
                  key={r.type}
                  onClick={() => setType(r.type)}
                  className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-coral"
                >
                  <p className="font-serif text-lg text-paper">{r.label}</p>
                  <p className="mt-1 text-sm text-mute">{r.blurb}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {type && type !== "one_on_one" && (
          <>
            <h1 className="font-serif text-2xl font-semibold">
              Name your {type === "inner_circle" ? "Inner Circle" : "Family"}
            </h1>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                type === "inner_circle" ? "e.g. Friends" : "e.g. Manana Family"
              }
              className="mt-8 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
            />
            <button
              onClick={handleCreate}
              disabled={loading}
              className="mt-8 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create room"}
            </button>
          </>
        )}

        {type === "one_on_one" && (
          <>
            <h1 className="font-serif text-2xl font-semibold">
              Start a One-on-One
            </h1>
            <p className="mt-4 text-mute">
              You&rsquo;ll get an invite link to send your Inong right after.
            </p>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="mt-8 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create room"}
            </button>
          </>
        )}

        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
      </div>
    </div>
  );
}

