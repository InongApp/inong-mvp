import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { roomId, experienceId, profileId, question, answer } =
      await req.json();

    if (!roomId || !experienceId || !profileId || !question || !answer) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Idempotent: never spend a second AI call extracting from the same round
    const { data: existing } = await supabaseAdmin
      .from("discoveries")
      .select("id")
      .eq("source_experience_id", experienceId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ discovery: null, skipped: true });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI not configured" },
        { status: 500 }
      );
    }

    const systemPrompt = `You extract durable, meaningful relationship discoveries from one Q&A exchange in a relationship-deepening game. A discovery is a genuine, specific insight about the person worth remembering long-term — a goal, fear, value, preference, formative memory, contradiction, or dream. Most everyday answers do NOT contain a real discovery — only flag one if it's actually meaningful, never for small talk or a trivial preference. Respond with ONLY JSON, no other text: {"discovery": "one sentence, third person, e.g. 'Wants to open a restaurant someday'", "category": "one short lowercase category word"} — or {"discovery": null} if there's nothing genuinely noteworthy here.`;

    const userPrompt = `Question: ${question}\nAnswer: ${answer}`;

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
          temperature: 0.3,
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

    if (!parsed.discovery) {
      return NextResponse.json({ discovery: null });
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("discoveries")
      .insert({
        room_id: roomId,
        source_experience_id: experienceId,
        profile_id: profileId,
        summary: parsed.discovery,
        category: parsed.category ?? null,
        is_ai_inferred: true,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({ discovery: inserted });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

