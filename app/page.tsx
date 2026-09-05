"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RoomCard = {
  id: string;
  type: "one_on_one" | "inner_circle" | "family";
  title: string;
  subtitle: string;
};

const TYPE_LABEL: Record<string, string> = {
  one_on_one: "One-on-One",
  inner_circle: "Inner Circle",
  family: "Family",
};

export default function HomePage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [rooms, setRooms] = useState<RoomCard[]>([]);
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
      setLoggedIn(false);
      setLoading(false);
      return;
    }
    setLoggedIn(true);
    const userId = session.user.id;

    const { data: myMemberships } = await supabase
      .from("room_members")
      .select("room_id, rooms(id, name, type, max_members)")
      .eq("profile_id", userId);

    const roomIds = (myMemberships ?? []).map((m: any) => m.room_id);
    if (roomIds.length === 0) {
      setRooms([]);
      setLoading(false);
      return;
    }

    const { data: allMembers } = await supabase
      .from("room_members")
      .select("room_id, profile_id, profiles(display_name)")
      .in("room_id", roomIds);

    const cards: RoomCard[] = (myMemberships ?? []).map((m: any) => {
      const r = m.rooms;
      const membersOfRoom = (allMembers ?? []).filter(
        (x: any) => x.room_id === r.id
      );

      if (r.type === "one_on_one") {
        const partner: any = membersOfRoom.find(
          (x: any) => x.profile_id !== userId
        );
        return {
          id: r.id,
          type: r.type,
          title: partner?.profiles?.display_name ?? "Waiting for your Inong",
          subtitle: "One-on-One",
        };
      }

      return {
        id: r.id,
        type: r.type,
        title: r.name ?? TYPE_LABEL[r.type],
        subtitle: `${TYPE_LABEL[r.type]} · ${membersOfRoom.length} member${
          membersOfRoom.length === 1 ? "" : "s"
        }`,
      };
    });

    setRooms(cards);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading...
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="flex flex-1 flex-col justify-between">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="font-serif text-3xl font-semibold leading-tight">
            Who&rsquo;s your
            <br />
            Inong?
          </h1>
          <p className="mt-4 max-w-xs text-mute">
            Choose the person who matters to you. Then find out how well you
            two actually know each other.
          </p>
        </div>

        <Link
          href="/login"
          className="w-full rounded-full bg-coral py-4 text-center font-medium text-ink transition hover:opacity-90"
        >
          Get started
        </Link>
        <Link
          href="/about"
          className="mt-3 block text-center text-sm text-mute hover:text-paper"
        >
          About INONG™ & how to play
        </Link>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-between">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="font-serif text-2xl font-semibold">
            No rooms yet
          </h1>
          <p className="mt-4 max-w-xs text-mute">
            Start a One-on-One, or create an Inner Circle or Family room to
            invite more people.
          </p>
        </div>

        <button
          onClick={() => router.push("/rooms/new")}
          className="w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
        >
          + New room
        </button>
        <Link
          href="/about"
          className="mt-3 block text-center text-sm text-mute hover:text-paper"
        >
          About INONG™ & how to play
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-serif text-2xl font-semibold">Your rooms</h1>

      <div className="mt-6 flex-1 space-y-3">
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => router.push(`/rooms/${r.id}`)}
            className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-coral"
          >
            <p className="font-serif text-lg text-paper">{r.title}</p>
            <p className="mt-1 text-sm text-mute">{r.subtitle}</p>
          </button>
        ))}
      </div>

      <button
        onClick={() => router.push("/rooms/new")}
        className="mt-6 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
      >
        + New room
      </button>
      <Link
        href="/about"
        className="mt-3 block text-center text-sm text-mute hover:text-paper"
      >
        About INONG™ & how to play
      </Link>
    </div>
  );
}

