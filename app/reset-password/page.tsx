"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleReset() {
    if (password.length < 6) return setError("At least 6 characters.");
    setLoading(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password,
      });
      if (updateErr) throw updateErr;
      setDone(true);
      setTimeout(() => router.push("/pair"), 1500);
    } catch (e: any) {
      setError(
        e.message ??
          "Something went wrong. The reset link may have expired — request a new one from the login page."
      );
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-1 items-center justify-center text-center text-mute">
        Password updated. Taking you in...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className="font-serif text-2xl font-semibold">
        Set a new password
      </h1>

      <label className="mt-8 text-sm text-mute">New password</label>
      <div className="mt-2 flex items-center rounded-card bg-surface px-4 focus-within:ring-2 focus-within:ring-coral">
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          className="flex-1 bg-transparent py-3 text-paper placeholder:text-mute focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShowPassword((s) => !s)}
          className="pl-3 text-xs text-mute hover:text-paper"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>

      <button
        onClick={handleReset}
        disabled={loading}
        className="mt-8 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "..." : "Update password"}
      </button>

      {error && <p className="mt-4 text-sm text-coral">{error}</p>}
    </div>
  );
}

