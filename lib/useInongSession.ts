"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function useInongSession() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("your Inong");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }
      if (!active) return;
      setUserId(user.id);

      const { data: link } = await supabase
        .from("inong_links")
        .select("id, user_a, user_b")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!link) {
        router.replace("/pair");
        return;
      }
      if (!active) return;
      setLinkId(link.id);

      const otherId = link.user_a === user.id ? link.user_b : link.user_a;
      if (otherId) {
        const { data: other } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", otherId)
          .single();
        if (other && active) setFriendName(other.display_name);
      }

      if (active) setReady(true);
    }

    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { userId, linkId, friendName, ready };
}
