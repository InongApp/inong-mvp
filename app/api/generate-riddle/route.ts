import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRelevantDiscoveries } from "@/lib/discoveryRelevance";

export async function POST(req: Request) {
  try {
    const { roomId, usedAnswers } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI not configured" },
        { status: 500 }
      );
    }

    let discoveriesContext = "";
    if (roomId) {
      const relevant = await getRelevantDiscoveries(roomId, 5);
      if (relevant.length > 0) {
        discoveriesContext = `\n\nOptionally, you can personalize this using something already known about this relationship (only if it fits naturally):\n${relevant
          .map((s) => `- ${s}`)
          .join("\n")}`;
      }
    }

    const systemPrompt = `You create a "what am I looking at?" picture-guessing riddle for two close people to play together. Invent a specific, concrete, describable thing — an object, place, scene, animal, or image (real or imaginative) that's genuinely fun and fair to guess within two clues.

CRITICAL — avoid ambiguity: your clues must point UNIQUELY to your correct_answer and rule out obvious look-alikes. If your answer could easily be confused with something else that fits the same clues equally well (e.g. clues that fit both "bee" and "moth", or "cat" and "small dog"), you have failed — either make the answer the more obvious/common thing the clues describe, or add a distinguishing detail to clue_2 that clearly rules out the confusable alternative. Before finalizing, check: could a reasonable person guess something else that also fits both clues equally well? If yes, fix it.

Provide clue_1 (vague — a general hint that doesn't give it away) and clue_2 (much more specific — narrows it down to ONLY your correct_answer, ruling out near-misses), plus correct_answer (short, a few words at most). Keep it playful, never mean or so obscure it's unfair.`;

    const usedList = (usedAnswers || []).slice(-20);
    const userPrompt = `Answers already used in this relationship (never repeat these):
${usedList.length ? usedList.map((a: string) => `- ${a}`).join("\n") : "(none yet)"}${discoveriesContext}

Respond with ONLY JSON, no other text: {"clue_1": "...", "clue_2": "...", "correct_answer": "..."}`;

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.9,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");

    if (!parsed.clue_1 || !parsed.clue_2 || !parsed.correct_answer) {
      throw new Error("Malformed riddle response");
    }

    return NextResponse.json({
      clue1: parsed.clue_1,
      clue2: parsed.clue_2,
      answer: parsed.correct_answer,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

