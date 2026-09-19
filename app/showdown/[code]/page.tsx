"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { leagueLabel } from "@/lib/leagues";
import {
  Challenge,
  getChallengeByCode,
  acceptChallenge,
  windowLabelText,
} from "@/lib/showdownChallenges";

type MyRoom = { id: string; title: string };

export default function AcceptShowdownPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [myRooms, setMyRooms] = useState<MyRoom[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
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
      router.replace(`/login?next=/showdown/${params.code}`);
      return;
    }
    setUserId(session.user.id);

    const found = await getChallengeByCode(params.code);
    if (!found) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    if (new Date(found.expires_at) < new Date()) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setChallenge(found);

    // Already accepted — if it's one of my rooms, just go straight there.
    if (found.challenged_room_id) {
      const { data: membership } = await supabase
        .from("room_members")
        .select("room_id")
        .eq("room_id", found.challenged_room_id)
        .eq("profile_id", session.user.id)
        .maybeSingle();
      if (membership) {
        router.replace(`/rooms/${found.challenged_room_id}/compete`);
        return;
      }
      setNotFound(true); // already claimed by someone else
      setLoading(false);
      return;
    }

    // Not yet accepted — list this person's own one-on-one Pairs to choose from.
    const { data: memberships } = await supabase
      .from("room_members")
      .select("room_id, rooms(id, type, pair_username)")
      .eq("profile_id", session.user.id);

    const eligible: MyRoom[] = (memberships ?? [])
      .map((m: any) => m.rooms)
      .filter((r: any) => r && r.type === "one_on_one" && r.id !== found.challenger_room_id)
      .map((r: any) => ({ id: r.id, title: r.pair_username ?? "Your Pair" }));

    setMyRooms(eligible);
    setLoading(false);
  }

  async function handleAccept(roomId: string) {
    if (!challenge) return;
    setAccepting(roomId);
    setError(null);
    try {
      const ok = await acceptChallenge(challenge.id, roomId);
      if (ok) {
        router.push(`/rooms/${roomId}/compete`);
      } else {
        setError("This challenge was just accepted by someone else.");
      }
    } finally {
      setAccepting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading...
      </div>
    );
  }

  if (notFound || !challenge) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-mute">
          This challenge link doesn&rsquo;t exist, has expired, or has already
          been claimed.
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

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-coral text-3xl">
        🏆
      </div>
      <h1 className="font-serif text-2xl font-semibold">You've been challenged!</h1>
      <p className="mt-2 text-sm text-mute">
        {leagueLabel(challenge.league_key)} League ·{" "}
        {windowLabelText(challenge.window_label)}
      </p>

      {myRooms.length === 0 ? (
        <p className="mt-8 max-w-xs text-mute">
          You don&rsquo;t have a Pair to accept this with yet. Start a
          One-on-One room first, then come back to this link.
        </p>
      ) : (
        <div className="mt-8 w-full max-w-sm space-y-2 text-left">
          <p className="text-xs uppercase tracking-wide text-mute">
            Accept with which Pair?
          </p>
          {myRooms.map((r) => (
            <button
              key={r.id}
              onClick={() => handleAccept(r.id)}
              disabled={accepting === r.id}
              className="w-full rounded-card border border-mute px-4 py-3 text-left transition hover:border-coral disabled:opacity-50"
            >
              {accepting === r.id ? "Accepting..." : r.title}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-coral">{error}</p>}
    </div>
  );
}

