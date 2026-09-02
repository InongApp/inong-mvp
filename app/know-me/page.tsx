"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { questionsByType } from "@/lib/questions";
import RevealCard from "@/components/RevealCard";

type Experience = {
  id: string;
  question: string;
  options: string[];
  created_by: string;
};

export default function KnowMePage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [friendName, setFriendName] = useState("your Inong");
  const [experience, setExperience] = useState<Experience | null>(null);
  const [selfAnswer, setSelfAnswer] = useState<string | null>(null);
  const [predictionAnswer, setPredictionAnswer] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setProfileId(localStorage.getItem("inong_profile_id"));
    setLinkId(localStorage.getItem("inong_link_id"));
  }, []);

  useEffect(() => {
    if (!linkId || !profileId) return;
    load();
    const interval = setInterval(load, 2500);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId, profileId]);

  async function load() {
    if (!linkId || !profileId) return;

    const { data: link } = await supabase
      .from("inong_links")
      .select("user_a, user_b")
      .eq("id", linkId)
      .single();

    if (link) {
      const otherId = link.user_a === profileId ? link.user_b : link.user_a;
      if (otherId) {
        const { data: other } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", otherId)
          .single();
        if (other) setFriendName(other.display_name);
      }
    }

    const { data: experiences } = await supabase
      .from("experiences")
      .select("id, question, options, created_by")
      .eq("link_id", linkId)
      .eq("type", "know_me")
      .order("created_at", { ascending: true });

    let current = (experiences ?? []).find((exp) => true);
    // find first experience without both responses complete
    for (const exp of experiences ?? []) {
      const { data: responses } = await supabase
        .from("responses")
        .select("profile_id, answer, is_prediction")
        .eq("experience_id", exp.id);
      const complete = (responses ?? []).length >= 2;
      if (!complete) {
        current = exp as Experience;
        break;
      }
      current = undefined as any;
    }

    if (!current) {
      // create a new one from the question bank
      const used = new Set((experiences ?? []).map((e: any) => e.question));
      const bank = questionsByType("know_me");
      const next = bank.find((q) => !used.has(q.prompt));
      if (next) {
        const { data: created } = await supabase
          .from("experiences")
          .insert({
            link_id: linkId,
            type: "know_me",
            question: next.prompt,
            options: next.options,
            created_by: profileId,
          })
          .select()
          .single();
        current = created as Experience;
      }
    }

    if (current) {
      setExperience(current as Experience);
      const { data: responses } = await supabase
        .from("responses")
        .select("profile_id, answer, is_prediction")
        .eq("experience_id", (current as Experience).id);

      const mine = (responses ?? []).find((r) => r.profile_id === profileId);
      const theirs = (responses ?? []).find((r) => r.profile_id !== profileId);

      if (mine) setSelfAnswer(mine.answer);
      if ((current as Experience).created_by === profileId) {
        setPredictionAnswer(theirs?.answer ?? null);
      } else {
        setPredictionAnswer(mine?.answer ?? null);
        if (theirs) setSelfAnswer(theirs.answer);
      }
    }

    setLoading(false);
  }

  async function submitAnswer(option: string) {
    if (!experience || !profileId) return;
    const isSubject = experience.created_by === profileId;
    await supabase.from("responses").insert({
      experience_id: experience.id,
      profile_id: profileId,
      answer: option,
      is_prediction: !isSubject,
    });
    load();
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading your Inong...
      </div>
    );
  }

  if (!linkId || !profileId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-mute">You need to add your Inong first.</p>
      </div>
    );
  }

  if (!experience) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        No questions left in the bank — add more to lib/questions.ts.
      </div>
    );
  }

  const isSubject = experience.created_by === profileId;
  const bothAnswered = selfAnswer && predictionAnswer;

  if (bothAnswered) {
    return (
      <RevealCard
        matched={selfAnswer === predictionAnswer}
        yourAnswer={isSubject ? selfAnswer! : predictionAnswer!}
        theirGuess={isSubject ? predictionAnswer! : selfAnswer!}
        friendName={friendName}
        continueLabel="Next question"
        onContinue={() => {
          setExperience(null);
          setSelfAnswer(null);
          setPredictionAnswer(null);
          setLoading(true);
          load();
        }}
      />
    );
  }

  const alreadyAnswered = isSubject ? !!selfAnswer : !!predictionAnswer;

  if (alreadyAnswered) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-sm uppercase tracking-wide text-mute">
          Waiting on {friendName}
        </p>
        <p className="mt-4 max-w-xs text-mute">
          You&rsquo;ve answered. We&rsquo;ll reveal it as soon as they do too.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center">
      <p className="text-sm uppercase tracking-wide text-mute">
        {isSubject ? "Know Me" : `Know ${friendName}`}
      </p>
      <h1 className="font-serif mt-3 text-2xl font-semibold leading-snug">
        {isSubject
          ? experience.question
          : `What would ${friendName} say? "${experience.question}"`}
      </h1>

      <div className="mt-8 space-y-3">
        {experience.options.map((option) => (
          <button
            key={option}
            onClick={() => submitAnswer(option)}
            className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-coral hover:text-coral"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
