"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function afterAuth(userId: string) {
    // Make sure a profiles row exists for this user
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!existing) {
      await supabase.from("profiles").insert({
        id: userId,
        display_name: displayName.trim() || email.split("@")[0],
      });
    }

    // Route based on whether they already have an active pairing
    const { data: link } = await supabase
      .from("inong_links")
      .select("id")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .eq("status", "active")
      .maybeSingle();

    router.push(link ? "/know-me" : "/pair");
  }

  async function handleSignUp() {
    if (!displayName.trim()) return setError("Enter your name.");
    if (!email.trim() || !password) return setError("Enter an email and password.");
    setLoading(true);
    setError(null);
    try {
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (signUpErr) throw signUpErr;

      if (!data.session) {
        setError(
          "Check your email to confirm your account, then sign in. (For fast testing, disable 'Confirm email' in Supabase Auth settings.)"
        );
        return;
      }

      await afterAuth(data.user!.id);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setLoading(true);
    setError(null);
    try {
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInErr) throw signInErr;
      await afterAuth(data.user.id);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className="font-serif text-2xl font-semibold">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>

      {mode === "signup" && (
        <>
          <label className="mt-8 text-sm text-mute">Your name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Thabo"
            className="mt-2 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
          />
        </>
      )}

      <label className="mt-6 text-sm text-mute">Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="mt-2 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
      />

      <label className="mt-6 text-sm text-mute">Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 6 characters"
        className="mt-2 rounded-card bg-surface px-4 py-3 text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
      />

      <button
        onClick={mode === "signup" ? handleSignUp : handleSignIn}
        disabled={loading}
        className="mt-8 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "..." : mode === "signup" ? "Sign up" : "Sign in"}
      </button>

      <button
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setError(null);
        }}
        className="mt-4 text-center text-sm text-mute hover:text-paper"
      >
        {mode === "signup"
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </button>

      {error && <p className="mt-4 text-sm text-coral">{error}</p>}
    </div>
  );
}
