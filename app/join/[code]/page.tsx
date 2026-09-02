"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "error">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    const code = params.code;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Not logged in yet — remember the code, send them to sign up/in,
      // then come straight back here once they're authenticated.
      localStorage.setItem("inong_pending_invite", code);
      router.replace("/login");
      return;
    }

    try {
      const { data: link, error: linkErr } = await supabase
        .from("inong_links")
        .select("*")
        .eq("invite_code", code.toUpperCase())
        .eq("status", "pending")
        .single();

      if (linkErr || !link) {
        throw new Error(
          "This invite link isn't valid, or has already been used."
        );
      }
      if (link.user_a === user.id) {
        throw new Error("That's your own invite link.");
      }

      const { error: updateErr } = await supabase
        .from("inong_links")
        .update({ user_b: user.id, status: "active" })
        .eq("id", link.id);
      if (updateErr) throw updateErr;

      localStorage.removeItem("inong_pending_invite");
      router.replace("/know-me");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
      setStatus("error");
    }
  }

  if (status === "checking") {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Connecting you to your Inong...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-mute">{error}</p>
      <button
        onClick={() => router.push("/pair")}
        className="mt-6 rounded-full bg-coral px-6 py-3 font-medium text-ink transition hover:opacity-90"
      >
        Go to pairing
      </button>
    </div>
  );
}
