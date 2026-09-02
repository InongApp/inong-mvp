"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function PairPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [joinCode, setJoinCode] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }
      setUserId(user.id);

      const { data: link } = await supabase
        .from("inong_links")
        .select("id")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .eq("status", "active")
        .maybeSingle();

      if (link) {
        router.replace("/know-me");
        return;
      }

      setChecking(false);
    }
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const code = randomCode();
      const { error: linkErr } = await supabase.from("inong_links").insert({
        user_a: userId,
        invite_code: code,
        status: "pending",
      });
      if (linkErr) throw linkErr;
      setInviteCode(code);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!userId) return;
    if (!joinCode.trim()) return setError("Enter the invite code.");
    setLoading(true);
    setError(null);
    try {
      const { data: link, error: linkErr } = await supabase
        .from("inong_links")
        .select("*")
        .eq("invite_code", joinCode.trim().toUpperCase())
        .eq("status", "pending")
        .single();
      if (linkErr || !link) throw new Error("That code doesn't look right.");
      if (link.user_a === userId) throw new Error("That's your own invite code.");

      const { error: updateErr } = await supabase
        .from("inong_links")
        .update({ user_b: userId, status: "active" })
        .eq("id", link.id);
      if (updateErr) throw updateErr;

      router.push("/know-me");
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

  if (inviteCode) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-sm uppercase tracking-wide text-mute">
          Share this with your Inong
        </p>
        <p className="font-serif mt-4 text-5xl font-semibold tracking-widest text-coral">
          {inviteCode}
        </p>
        <p className="mt-4 max-w-xs text-mute">
          Once they join with this code, you&rsquo;ll both be ready to play.
        </p>
        <button
          onClick={() => router.push("/know-me")}
          className="mt-10 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
        >
          They&rsquo;ve joined — let&rsquo;s play
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className="font-serif text-2xl font-semibold">Add your Inong</h1>

      {mode === "choose" && (
        <div className="mt-8 space-y-3">
          <button
            onClick={() => setMode("create")}
            className="w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
          >
            Start a new Inong
          </button>
          <button
            onClick={() => setMode("join")}
            className="w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
          >
            I have an invite code
          </button>
        </div>
      )}

      {mode === "create" && (
        <button
          onClick={handleCreate}
          disabled={loading}
          className="mt-8 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Get my invite code"}
        </button>
      )}

      {mode === "join" && (
        <>
          <label className="mt-6 text-sm text-mute">Invite code</label>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="e.g. A1B2C3"
            className="mt-2 rounded-card bg-surface px-4 py-3 uppercase tracking-widest text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
          />
          <button
            onClick={handleJoin}
            disabled={loading}
            className="mt-8 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Joining..." : "Join my Inong"}
          </button>
        </>
      )}

      {error && <p className="mt-4 text-sm text-coral">{error}</p>}
    </div>
  );
}
