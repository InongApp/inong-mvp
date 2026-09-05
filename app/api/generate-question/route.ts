import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ROUND_TYPE_INSTRUCTIONS: Record<string, string> = {
  discover:
    "This is a DISCOVER round: aim for a dimension of this person that hasn't come up before — a genuinely new angle, not a variation on something already known.",
  play:
    "This is a PLAY round: keep it light, quick, and a little competitive. Fun over heavy.",
  surprise:
    "This is a SURPRISE round: take a deliberately unexpected or quirky angle — a hypothetical, an unusual framing, something that makes them go 'wait, what?' in a good way.",
  connection:
    "This is a CONNECTION round: ask about the RELATIONSHIP itself — 'us', shared dynamics, how they see each other together — not just a fact about one person in isolation.",
};

export async function POST(req: Request) {
  try {
    const {
      type,
      usedQuestions,
      askerName,
      subjectName,
      roomId,
      roundType,
      forceFormat, // "choice" | "open" — decided by the app, not left to the AI
    } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI not configured" },
        { status: 500 }
      );
    }

    const isKnowMe = type === "know_me";

    const systemPrompt = isKnowMe
      ? `You write short, specific, emotionally real questions for a "Know Me" game between two close people (romantic partners, family, or close friends). The question is answered by the SUBJECT about themselves; the ASKER predicts what the subject will say. Questions must feel personal and deepen the relationship — never generic small talk, never something answerable with a shrug. Draw on real human topics: fears, values, memories, relationships, ambitions, regrets, joys, contradictions, formative experiences. The question FORMAT (multiple-choice or open-ended) will be specified explicitly in the instructions below — follow that exactly, don't decide it yourself.`
      : `You write short, specific "Bet on Me" prediction questions between two close people — the ASKER predicts what the SUBJECT will choose or do, often something current or near-term (today, this week, right now), not abstract. Keep it playful but never generic or shallow. The question FORMAT (multiple-choice or open-ended) will be specified explicitly below — follow that exactly.`;

    const formatInstruction =
      forceFormat === "open"
        ? `\n\nFORMAT (required): write this as a fully OPEN-ENDED question. You MUST set "options" to null — do not invent multiple-choice options this time.`
        : `\n\nFORMAT (required): write this as a MULTIPLE-CHOICE question with exactly 2-4 short, distinct options. You MUST provide "options" as an array — do not return null.`;

    // Deepen and Memory reference one SPECIFIC real discovery — this is the
    // actual "Because you said..." mechanic, not just generic memory-awareness.
    let followUpInstruction = "";
    let discoveriesContext = "";

    if (roomId && (roundType === "deepen" || roundType === "memory")) {
      const orderAscending = roundType === "memory"; // memory reaches further back; deepen uses the most recent
      const { data: discoveries } = await supabaseAdmin
        .from("discoveries")
        .select("summary")
        .eq("room_id", roomId)
        .order("created_at", { ascending: orderAscending })
        .limit(1);

      const chosen = discoveries?.[0]?.summary;
      if (chosen) {
        followUpInstruction =
          roundType === "deepen"
            ? `\n\nThis is a DEEPEN round. Here is something real that was just discovered about ${subjectName}: "${chosen}". Write a question that goes directly deeper on THIS specific thing — a natural "because you said..." follow-up, not a generic new topic.`
            : `\n\nThis is a MEMORY round. Here is something discovered earlier in this relationship's journey about ${subjectName}: "${chosen}". Write a question that revisits it — checking in, asking what's changed, or exploring a related memory.`;
      }
    } else if (roomId) {
      const { data: discoveries } = await supabaseAdmin
        .from("discoveries")
        .select("summary")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (discoveries && discoveries.length > 0) {
        discoveriesContext = `\n\nWhat's already been discovered about ${subjectName} in past rounds:\n${discoveries
          .map((d: any) => `- ${d.summary}`)
          .join(
            "\n"
          )}\nUse this to avoid repeating known ground.`;
      }
    }

    const roundTypeInstruction =
      followUpInstruction || ROUND_TYPE_INSTRUCTIONS[roundType] || "";

    const usedList = (usedQuestions || []).slice(-30);
    const userPrompt = `Asker: ${askerName}. Subject (the person being asked about): ${subjectName}.

Questions already used in this relationship (never repeat these or anything too similar):
${usedList.length ? usedList.map((q: string) => `- ${q}`).join("\n") : "(none yet)"}${discoveriesContext}${roundTypeInstruction}${formatInstruction}

Write ONE new question. Respond with ONLY JSON, no other text, in exactly this shape:
{"question": "...", "options": ["...", "..."]}
or, only if instructed to write an open answer:
{"question": "...", "options": null}`;

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
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);

    if (!parsed.question || typeof parsed.question !== "string") {
      throw new Error("Malformed AI response");
    }

    const options =
      Array.isArray(parsed.options) && parsed.options.length >= 2
        ? parsed.options.slice(0, 4)
        : null;

    return NextResponse.json({ question: parsed.question, options });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

