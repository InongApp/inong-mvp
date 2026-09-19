import { NextResponse } from "next/server";
import { relationshipModeInstruction } from "@/lib/relationshipMode";
import { leagueToModeStage, LeagueKey } from "@/lib/leagues";

// A Showdown's questions must be IDENTICAL for both Pairs and never
// personalized to either Pair's own Discoveries — that's what keeps a
// win comparable across two completely different relationships. League
// still shapes the tone (a Courting-league question feels different from
// Long-Married), but nothing here ever references a specific couple.
const QUESTIONS_PER_SHOWDOWN = 6;

export async function POST(req: Request) {
  try {
    const { leagueKey } = (await req.json()) as { leagueKey: LeagueKey | null };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI not configured" }, { status: 500 });
    }

    const { mode, stage } = leagueToModeStage(leagueKey ?? null);
    const modeInstruction = relationshipModeInstruction(mode, stage);

    const systemPrompt = `You write short, universally-relatable multiple-choice questions for a live, timed "Showdown" between two different couples/pairs, competing to see who can predict their own partner more accurately. CRITICAL: every question must work equally well for ANY pair in this same category — never reference specific people, specific relationships, or anything personalized. These are generic but genuinely interesting questions about preferences, reactions, and choices that any pair in this category could answer meaningfully. ${modeInstruction}

Always write MULTIPLE-CHOICE questions with exactly 3-4 short, distinct options — never open-ended, since this is timed and needs instant, comparable answers.`;

    const userPrompt = `Write ${QUESTIONS_PER_SHOWDOWN} DIFFERENT questions for one Showdown. Respond with ONLY JSON, no other text, in exactly this shape:
{"questions": [{"question": "...", "options": ["...", "...", "..."]}, ...]}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");

    const questions = Array.isArray(parsed.questions)
      ? parsed.questions
          .filter((q: any) => q.question && Array.isArray(q.options) && q.options.length >= 2)
          .slice(0, QUESTIONS_PER_SHOWDOWN)
          .map((q: any) => ({ question: q.question, options: q.options.slice(0, 4) }))
      : [];

    if (questions.length < QUESTIONS_PER_SHOWDOWN) {
      throw new Error("AI did not return enough valid questions");
    }

    return NextResponse.json({ questions });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
}

