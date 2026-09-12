"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type ExperienceStatus = "live" | "soon";

const EXPERIENCES: {
  name: string;
  tagline: string;
  bestFor: string;
  status: ExperienceStatus;
  href: string | null; // route inside a one-on-one room; null = not directly playable yet
}[] = [
  {
    name: "Know Your INONG™",
    tagline: "How well do you know me? Predict what I'll choose.",
    bestFor: "Best for: discovering how well you actually know each other, one honest question at a time.",
    status: "live",
    href: "know-me",
  },
  {
    name: "Bet on Me",
    tagline: "How confident are you in me? Place a bet, then reveal.",
    bestFor: "Best for: playful confidence and risk — real stakes, not just facts.",
    status: "live",
    href: "bet-on-me",
  },
  {
    name: "INONG™ Visuals in Words",
    tagline: "What am I looking at? (text version now — real images with Premium, coming soon)",
    bestFor: "Best for: seeing how differently you each picture things, or a quick competitive guessing game.",
    status: "live",
    href: "visuals-in-words",
  },
  {
    name: "Our INONG™ Thing",
    tagline: "Our jokes, our lingo, our stories.",
    bestFor: "Best for: building your own private language — kept forever, added to anytime.",
    status: "live",
    href: "our-thing",
  },
  {
    name: "Surprise Me",
    tagline: "Our random challenges.",
    bestFor: "Two modes: light Surprises (no pressure, no clock) or bolder Dares (countdown timer, a little more vulnerable).",
    status: "live",
    href: "surprise-me",
  },
  {
    name: "🤖 Karabo",
    tagline: "Your Digital Friend — a personality of your own choosing.",
    bestFor: "Best for: whenever you're curious, no real partner needed.",
    status: "live",
    href: "digital-friend",
  },
  {
    name: "INONG™ Court",
    tagline: "Let the friends decide.",
    bestFor: "Best for: settling playful disputes with your circle's help. Opens once Group and Family rooms unlock.",
    status: "soon",
    href: null,
  },
  {
    name: "Our INONG™ Memories",
    tagline: "Let's revisit our shared history.",
    bestFor: "Best for: revisiting what you've already discovered and letting it sink in.",
    status: "live",
    href: "memories",
  },
  {
    name: "INONG™ 24",
    tagline: "Our special 24-hour experiences.",
    bestFor: "\"Turns the app from something we play sometimes into something we check every day.\"",
    status: "live",
    href: "daily",
  },
];

export default function AboutPage() {
  const router = useRouter();
  const [routing, setRouting] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function playExperience(href: string) {
    setRouting(href);
    setNote(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push("/login");
        return;
      }

      // Find one-on-one rooms this person is actually paired in (2 members).
      const { data: memberRows } = await supabase
        .from("room_members")
        .select("room_id, rooms!inner(id, type)")
        .eq("profile_id", session.user.id)
        .eq("rooms.type", "one_on_one");

      const roomIds = (memberRows ?? []).map((m: any) => m.room_id);
      let pairedRoomIds: string[] = [];
      if (roomIds.length > 0) {
        const { data: allMembers } = await supabase
          .from("room_members")
          .select("room_id")
          .in("room_id", roomIds);
        const counts: Record<string, number> = {};
        (allMembers ?? []).forEach((m: any) => {
          counts[m.room_id] = (counts[m.room_id] ?? 0) + 1;
        });
        pairedRoomIds = roomIds.filter((id) => counts[id] === 2);
      }

      if (pairedRoomIds.length === 1) {
        router.push(`/rooms/${pairedRoomIds[0]}/${href}`);
      } else if (pairedRoomIds.length === 0) {
        setNote("You'll need a paired one-on-one room first — let's set one up.");
        setTimeout(() => router.push("/rooms/new"), 900);
      } else {
        setNote("You have a few rooms — pick one, then tap this experience from inside it.");
        setTimeout(() => router.push("/rooms"), 900);
      }
    } finally {
      setRouting(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => router.push("/")}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← Back
      </button>

      <h1 className="font-serif mt-4 text-3xl font-semibold text-center">
        About INONG™
      </h1>
      <p className="mt-2 text-center text-sm uppercase tracking-widest text-mute">
        Put Down the World. Pick Up Each Other.
      </p>

      {/* ---------- The Inspiration ---------- */}
      <section className="mt-10">
        <h2 className="font-serif text-xl font-semibold">
          The inspiration behind INONG™
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-paper">
          INONG™ is inspired by a Setswana proverb describing a deep
          friendship — rooted in trust, vulnerability, affection, and a
          profound emotional connection:
        </p>
        <p className="font-serif mt-3 text-lg italic text-coral">
          &ldquo;Re ntshana se se mo inong&rdquo;
        </p>
        <p className="mt-3 text-sm leading-relaxed text-mute">
          That relationship may be romantic, or just as easily a soulmate, a
          confidant, or a platonic friendship. Our smartphones have
          tremendously transformed communication — for the good or bad.
          INONG™ is built to enhance and deepen relationships, not replace
          them.
        </p>
        <img
          src="/about/inong-inspiration.png"
          alt="The inspiration behind INONG — Re ntshana se se mo inong"
          className="mt-5 w-full rounded-card"
        />
      </section>

      {/* ---------- The Experiences ---------- */}
      <section className="mt-10">
        <h2 className="font-serif text-xl font-semibold">INONG™ Experiences</h2>
        <p className="mt-3 text-sm leading-relaxed text-mute">
          INONG™ is a growing set of relationship experiences — not one
          question game. Here&rsquo;s the full roadmap:
        </p>

        <div className="mt-4 space-y-2">
          {EXPERIENCES.map((exp) => {
            const clickable = exp.status === "live" && exp.href;
            const Wrapper = clickable ? "button" : "div";
            return (
              <Wrapper
                key={exp.name}
                onClick={clickable ? () => playExperience(exp.href!) : undefined}
                disabled={clickable ? routing !== null : undefined}
                className={`w-full rounded-card bg-surface px-4 py-3 text-left transition ${
                  clickable ? "hover:bg-surface/70 active:opacity-80" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-paper">{exp.name}</p>
                  {exp.status === "live" ? (
                    <span className="shrink-0 rounded-full bg-coral px-3 py-1 text-xs font-medium text-ink">
                      {routing === exp.href ? "..." : "Live"}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-mute px-3 py-1 text-xs text-mute">
                      Under construction
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-mute">{exp.tagline}</p>
                <p className="mt-1 text-xs text-coral">{exp.bestFor}</p>
              </Wrapper>
            );
          })}
        </div>
        {note && <p className="mt-3 text-center text-xs text-mute">{note}</p>}

        <img
          src="/about/inong-experiences.jpg"
          alt="Full list of INONG experiences, room types, and pricing"
          className="mt-5 w-full rounded-card"
        />
      </section>

      {/* ---------- How to Play ---------- */}
      <section className="mt-10">
        <h2 className="font-serif text-xl font-semibold">How to play</h2>
        <p className="mt-3 text-sm text-mute">
          Walking through Know Your INONG™ and Bet on Me, the two experiences
          live today (each with its own mechanic — see below):
        </p>

        <ol className="mt-4 space-y-4">
          {[
            {
              title: "Add your Inong",
              body: "Start a One-on-One, an Inner Circle (up to 12 people), or a Family room (unlimited) — then send an invite link.",
            },
            {
              title: "Pick an experience",
              body: "Inside a One-on-One room, choose Know Me, Bet on Me, or revisit Our Memories. Group rooms can spin off a private one-on-one with any member.",
            },
            {
              title: "Take turns",
              body: "Whoever was just answered-about gets the next turn — pull a surprise AI question or write your own.",
            },
            {
              title: "Answer, predict, reveal",
              body: "One of you answers for real, the other predicts. Reveal shows both, plus a comment thread to actually talk about it.",
            },
            {
              title: "Play a full Round",
              body: "5 questions each (10 total) makes one Round — a satisfying finish, not an endless quiz.",
            },
            {
              title: "Get your Recap",
              body: "Your score, anything genuinely discovered about each other, and an invite to start the next Round whenever you're both ready.",
            },
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-coral text-sm font-semibold text-ink">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-paper">{step.title}</p>
                <p className="mt-0.5 text-sm text-mute">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <button
        onClick={() => router.push("/")}
        className="mt-10 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
      >
        Start your Journey
      </button>
    </div>
  );
}

