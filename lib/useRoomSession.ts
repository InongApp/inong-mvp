"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function useRoomSession() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [friendId, setFriendId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("your Inong");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/login");
        return;
      }
      if (!active) return;
      const uid = session.user.id;
      setUserId(uid);
      setRoomId(params.roomId);

      const { data: memberRows } = await supabase
        .from("room_members")
        .select("profile_id, profiles(display_name)")
        .eq("room_id", params.roomId);

      const other: any = (memberRows ?? []).find(
        (m: any) => m.profile_id !== uid
      );
      if (other && active) {
        setFriendId(other.profile_id);
        setFriendName(other.profiles?.display_name ?? "your Inong");
      }

      if (active) setReady(true);
    }

    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { userId, roomId, friendId, friendName, ready };
}

