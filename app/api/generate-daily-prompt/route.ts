import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getRelevantDiscoveries } from "@/lib/discoveryRelevance";
import { relationshipModeInstruction } from "@/lib/relationshipMode";

export async function POST(req: Request) {
  try {
    const { roomId } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI not configured" },
        { status: 500 }
      );
    }

    let discoveriesContext = "";
    let modeInstruction = "";
    if (roomId) {
      const relevant = await getRelevantDiscoveries(roomId, 5);
      if (relevant.length > 0) {
        discoveriesContext = `\n\nWhat's already known about this relationship:\n${relevant
          .map((s) => `- ${s}`)
          .join("\n")}\nOptionally draw on this if it fits naturally.`;
      }
      const { data: room } = await supabaseAdmin
        .from("rooms")
        .select("relationship_mode, romantic_stage")
        .eq("id", roomId)
        .maybeSingle();
      modeInstruction = `\n\n${relationshipModeInstruction(
        room?.relationship_mode ?? null,
        room?.romantic_stage ?? null
      )}`;
    }

    const systemPrompt = `You write ONE short, reflective daily check-in question for two close people to answer independently, once a day. It should be small, easy to answer in a sentence, and genuinely worth a daily habit — a mood, a highlight, a hope, a small honest reflection. Never a fact-quiz question, never something that needs research or long thought. Always open-ended.${modeInstruction}`;

    const userPrompt = `Write today's check-in question.${discoveriesContext}

Respond with ONLY JSON, no other text: {"question": "..."}`;

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
          temperature: 0.8,
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

    if (!parsed.question) {
      throw new Error("Malformed daily prompt response");
    }

    return NextResponse.json({ question: parsed.question });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

