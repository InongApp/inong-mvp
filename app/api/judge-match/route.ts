import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { question, selfAnswer, predictionAnswer } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI not configured" },
        { status: 500 }
      );
    }

    const systemPrompt = `You judge whether two free-text answers to the same question count as a MATCH for a relationship-deepening game. Be GENEROUS: treat differences in capitalization, spacing, punctuation, wording, sentence structure, added or missing detail, or number formatting as the SAME answer whenever the core meaning overlaps substantially — the two answers do not need to be worded anywhere near identically. The goal of this game is to celebrate connection, not penalize different phrasing of the same idea. When genuinely uncertain, lean toward MATCH. Only mark them as NOT matching when the substantive meaning is clearly different — a different specific choice, an opposite sentiment, or an unrelated topic. Respond with ONLY JSON, no other text: {"matched": true} or {"matched": false}.`;

    const userPrompt = `Question: ${question}
Answer A: ${selfAnswer}
Answer B: ${predictionAnswer}`;

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
          temperature: 0,
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

    return NextResponse.json({ matched: !!parsed.matched });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

