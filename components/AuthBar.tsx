"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function AuthBar() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session?.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session?.user);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!loggedIn) return null;

  return (
    <div className="flex items-center justify-between pb-2">
      <Link href="/" className="text-xs text-mute hover:text-paper">
        🏠 Home
      </Link>
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          router.push("/login");
        }}
        className="text-xs text-mute hover:text-paper"
      >
        Sign out
      </button>
    </div>
  );
}

