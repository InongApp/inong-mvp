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

    const systemPrompt = `You judge whether two free-text answers to the same question count as a MATCH for a relationship game. Treat differences in capitalization, spacing, punctuation, added or missing words, or number formatting (e.g. "57" vs "57 years old") as the SAME answer if the core meaning matches. Only mark them as NOT matching if the substantive content is actually different. Respond with ONLY JSON, no other text: {"matched": true} or {"matched": false}.`;

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

