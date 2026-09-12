"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RoomType = "one_on_one" | "inner_circle" | "family";
type RelationshipMode = "romantic" | "soulmate" | "friendship";

const RELATIONSHIP_MODES: {
  mode: RelationshipMode;
  icon: string;
  label: string;
  blurb: string;
}[] = [
  {
    mode: "romantic",
    icon: "❤️",
    label: "Romantic",
    blurb: "Partners, dating, married, or engaged.",
  },
  {
    mode: "soulmate",
    icon: "✨",
    label: "Soulmate",
    blurb: "A profound bond — not necessarily romantic.",
  },
  {
    mode: "friendship",
    icon: "🤝",
    label: "Friendship",
    blurb: "Close friends, platonic, family-like.",
  },
];

const ROOM_TYPES: {
  type: RoomType;
  label: string;
  blurb: string;
  maxMembers: number | null;
  disabled?: boolean;
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
    disabled: true,
  },
  {
    type: "family",
    label: "Family",
    blurb: "Unlimited members.",
    maxMembers: null,
    disabled: true,
  },
];

export default function NewRoomPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [type, setType] = useState<RoomType | null>(null);
  const [relationshipMode, setRelationshipMode] = useState<RelationshipMode | null>(null);
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
    if (type === "one_on_one" && !relationshipMode) {
      return setError("Pick what kind of relationship this is first.");
    }
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
          relationship_mode: type === "one_on_one" ? relationshipMode : null,
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
        onClick={() => {
          if (type === "one_on_one" && relationshipMode) setRelationshipMode(null);
          else if (type) setType(null);
          else router.push("/");
        }}
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
            <p className="mt-2 text-sm text-mute">
              Group rooms are temporarily paused for beta testing — please
              use One-on-One for now.
            </p>
            <div className="mt-8 space-y-3">
              {ROOM_TYPES.map((r) => (
                <button
                  key={r.type}
                  disabled={r.disabled}
                  onClick={() => !r.disabled && setType(r.type)}
                  className={`w-full rounded-card border px-5 py-4 text-left transition ${
                    r.disabled
                      ? "cursor-not-allowed border-mute/40 opacity-50"
                      : "border-mute hover:border-coral"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-serif text-lg text-paper">{r.label}</p>
                    {r.disabled && (
                      <span className="rounded-full border border-mute px-2 py-0.5 text-[10px] uppercase tracking-wide text-mute">
                        Coming soon
                      </span>
                    )}
                  </div>
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

        {type === "one_on_one" && !relationshipMode && (
          <>
            <h1 className="font-serif text-2xl font-semibold">
              What kind of relationship is this?
            </h1>
            <p className="mt-2 text-sm text-mute">
              This shapes the tone of everything INONG™ generates for this
              room — romantic, deeply platonic, or somewhere your own to
              define.
            </p>
            <div className="mt-8 space-y-3">
              {RELATIONSHIP_MODES.map((r) => (
                <button
                  key={r.mode}
                  onClick={() => setRelationshipMode(r.mode)}
                  className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-coral"
                >
                  <p className="font-serif text-lg text-paper">
                    {r.icon} {r.label}
                  </p>
                  <p className="mt-1 text-sm text-mute">{r.blurb}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {type === "one_on_one" && relationshipMode && (
          <>
            <h1 className="font-serif text-2xl font-semibold">
              Start a One-on-One
            </h1>
            <p className="mt-2 text-sm text-coral">
              {RELATIONSHIP_MODES.find((r) => r.mode === relationshipMode)?.icon}{" "}
              {RELATIONSHIP_MODES.find((r) => r.mode === relationshipMode)?.label}
            </p>
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

