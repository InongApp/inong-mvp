"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { APP_PERSONAS, DIFFICULTY_LABEL, Difficulty } from "@/lib/digitalFriendPersonas";

type Mode = "know_me" | "bet_on_me";

export default function DigitalFriendSetupPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [personaChoice, setPersonaChoice] = useState<string | null>(null); // app preset key, or "custom"
  const [customName, setCustomName] = useState("");
  const [customTraits, setCustomTraits] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session?.user) {
        router.replace("/login");
        return;
      }
      setUserId(data.session.user.id);
    });
  }, [router]);

  async function startSession() {
    if (!userId || !mode || !personaChoice) return;

    let personaId: string | null = null;
    let personaKey: string;
    let personaName: string;
    let personaTraits: string;

    if (personaChoice === "custom") {
      if (!customName.trim() || !customTraits.trim()) {
        return setError("Give your custom friend a name and some traits.");
      }
      setStarting(true);
      setError(null);
      const { data: created, error: insertErr } = await supabase
        .from("digital_friend_personas")
        .insert({
          profile_id: userId,
          name: customName.trim(),
          traits: customTraits.trim(),
          type: "custom",
        })
        .select()
        .single();
      if (insertErr || !created) {
        setError(insertErr?.message ?? "Couldn't save that persona.");
        setStarting(false);
        return;
      }
      personaId = created.id;
      personaKey = created.id;
      personaName = created.name;
      personaTraits = created.traits;
    } else {
      const preset = APP_PERSONAS.find((p) => p.key === personaChoice)!;
      personaKey = preset.key;
      personaName = preset.name;
      personaTraits = preset.traits;
      setStarting(true);
      setError(null);
    }

    const { data: session, error: sessionErr } = await supabase
      .from("digital_friend_sessions")
      .insert({
        profile_id: userId,
        persona_id: personaId,
        persona_key: personaKey,
        persona_name: personaName,
        persona_traits: personaTraits,
        difficulty,
        mode,
      })
      .select()
      .single();

    if (sessionErr || !session) {
      setError(sessionErr?.message ?? "Couldn't start a session.");
      setStarting(false);
      return;
    }

    router.push(`/digital-friend/play/${session.id}`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => router.back()}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← Back
      </button>

      <h1 className="font-serif mt-4 text-2xl font-semibold">
        🤖 Meet Karabo
      </h1>
      <p className="mt-2 text-sm text-mute">
        Your Digital Friend — a personality of your own choosing, just
        between you and Karabo. Your real Inong&rsquo;s story stays
        completely untouched.
      </p>

      {/* ---------- Mode ---------- */}
      <div className="mt-6">
        <p className="text-xs uppercase tracking-wide text-mute">How do you want to play?</p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => setMode("know_me")}
            className={`flex-1 rounded-card border px-4 py-3 text-sm ${
              mode === "know_me"
                ? "border-coral text-coral"
                : "border-mute text-paper hover:border-paper"
            }`}
          >
            🧠 Know Me
          </button>
          <button
            onClick={() => setMode("bet_on_me")}
            className={`flex-1 rounded-card border px-4 py-3 text-sm ${
              mode === "bet_on_me"
                ? "border-skyblue text-skyblue"
                : "border-mute text-paper hover:border-paper"
            }`}
          >
            🎯 Bet on Me
          </button>
        </div>
      </div>

      {/* ---------- Persona ---------- */}
      <div className="mt-6">
        <p className="text-xs uppercase tracking-wide text-mute">
          Which side of Karabo do you want to meet?
        </p>
        <div className="mt-2 space-y-2">
          {APP_PERSONAS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPersonaChoice(p.key)}
              className={`w-full rounded-card border px-4 py-3 text-left ${
                personaChoice === p.key
                  ? "border-coral"
                  : "border-mute hover:border-paper"
              }`}
            >
              <p className="text-sm font-medium text-paper">{p.name}</p>
              <p className="mt-0.5 text-xs text-mute">{p.traits}</p>
            </button>
          ))}

          <button
            onClick={() => setPersonaChoice("custom")}
            className={`w-full rounded-card border border-dashed px-4 py-3 text-left ${
              personaChoice === "custom"
                ? "border-coral"
                : "border-mute hover:border-paper"
            }`}
          >
            <p className="text-sm font-medium text-paper">
              ✍️ Build Your Own{" "}
              <span className="text-xs text-mute">(Premium)</span>
            </p>
            <p className="mt-0.5 text-xs text-mute">
              Describe your real friend's personality and practice against a
              simulation of them specifically.
            </p>
          </button>

          {personaChoice === "custom" && (
            <div className="rounded-card bg-surface px-4 py-4">
              <label className="text-xs uppercase tracking-wide text-mute">
                Name
              </label>
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Digital Thabo"
                className="mt-1 w-full rounded-card bg-ink px-3 py-2 text-sm text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
              />
              <label className="mt-3 block text-xs uppercase tracking-wide text-mute">
                Personality & traits
              </label>
              <textarea
                value={customTraits}
                onChange={(e) => setCustomTraits(e.target.value)}
                placeholder="How they think, what they value, a few quirks..."
                rows={4}
                className="mt-1 w-full rounded-card bg-ink px-3 py-2 text-sm text-paper placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-coral"
              />
            </div>
          )}
        </div>
      </div>

      {/* ---------- Difficulty ---------- */}
      <div className="mt-6">
        <p className="text-xs uppercase tracking-wide text-mute">Difficulty</p>
        <div className="mt-2 space-y-2">
          {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={`w-full rounded-card border px-4 py-3 text-left text-sm ${
                difficulty === d
                  ? "border-coral text-coral"
                  : "border-mute text-paper hover:border-paper"
              }`}
            >
              {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={startSession}
        disabled={!mode || !personaChoice || starting}
        className="mt-8 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
      >
        {starting ? "Getting Karabo ready..." : "Let's play"}
      </button>
      {error && <p className="mt-3 text-sm text-coral">{error}</p>}
    </div>
  );
}

