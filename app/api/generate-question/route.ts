import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { type, usedQuestions, askerName, subjectName, roomId } =
      await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI not configured" },
        { status: 500 }
      );
    }

    const isKnowMe = type === "know_me";

    const systemPrompt = isKnowMe
      ? `You write short, specific, emotionally real questions for a "Know Me" game between two close people (romantic partners, family, or close friends). The question is answered by the SUBJECT about themselves; the ASKER predicts what the subject will say. Questions must feel personal and deepen the relationship — never generic small talk, never something answerable with a shrug. Draw on real human topics: fears, values, memories, relationships, ambitions, regrets, joys, contradictions, formative experiences. Vary between multiple-choice (2-4 short options) and fully open-ended questions — favor open-ended more often, since real depth rarely fits in a multiple-choice box.`
      : `You write short, specific "Bet on Me" prediction questions between two close people — the ASKER predicts what the SUBJECT will choose or do, often something current or near-term (today, this week, right now), not abstract. Keep it playful but never generic or shallow. Vary between multiple-choice (2-4 short options) and open-ended.`;

    let discoveriesContext = "";
    if (roomId) {
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
          )}\nUse this to go deeper or explore genuinely new territory — don't just re-ask something that would repeat what's already known.`;
      }
    }

    const usedList = (usedQuestions || []).slice(-30);
    const userPrompt = `Asker: ${askerName}. Subject (the person being asked about): ${subjectName}.

Questions already used in this relationship (never repeat these or anything too similar):
${usedList.length ? usedList.map((q: string) => `- ${q}`).join("\n") : "(none yet)"}${discoveriesContext}

Write ONE new question. Respond with ONLY JSON, no other text, in exactly this shape:
{"question": "...", "options": ["...", "..."]}
If the question is better as an open answer instead of multiple choice, use:
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

