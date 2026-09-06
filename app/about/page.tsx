"use client";

import { useRouter } from "next/navigation";

type ExperienceStatus = "live" | "soon";

const EXPERIENCES: {
  name: string;
  tagline: string;
  status: ExperienceStatus;
}[] = [
  { name: "Know Your INONG™", tagline: "How well do you know me? Predict what I'll choose.", status: "live" },
  { name: "Bet on Me", tagline: "How confident are you in me? Place a bet, then reveal.", status: "live" },
  { name: "INONG™ Visuals in Words", tagline: "What am I looking at?", status: "soon" },
  { name: "Our INONG™ Thing", tagline: "Our jokes, our lingo, our stories.", status: "soon" },
  { name: "Surprise Me", tagline: "Our random challenges.", status: "soon" },
  { name: "INONG™ Court", tagline: "Let the friends decide.", status: "soon" },
  { name: "Our INONG™ Memories", tagline: "Let's revisit our shared history.", status: "live" },
  { name: "INONG™ 24", tagline: "Our special 24-hour experiences.", status: "soon" },
];

export default function AboutPage() {
  const router = useRouter();

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
        Deepen your relationships
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
          {EXPERIENCES.map((exp) => (
            <div
              key={exp.name}
              className="flex items-center justify-between rounded-card bg-surface px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-paper">{exp.name}</p>
                <p className="mt-0.5 text-xs text-mute">{exp.tagline}</p>
              </div>
              {exp.status === "live" ? (
                <span className="shrink-0 rounded-full bg-coral px-3 py-1 text-xs font-medium text-ink">
                  Live
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-mute px-3 py-1 text-xs text-mute">
                  Under construction
                </span>
              )}
            </div>
          ))}
        </div>

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

