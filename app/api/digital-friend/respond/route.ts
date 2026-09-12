import { NextResponse } from "next/server";

const DIFFICULTY_INSTRUCTION: Record<string, string> = {
  easy: "Answer in a way that lines up OBVIOUSLY and directly with the stated traits — no subtlety, easy to predict from the description alone.",
  medium: "Answer with normal human nuance — mostly consistent with the traits, but with the small inconsistencies a real person has.",
  hard: "Answer in a way that can be genuinely surprising or seem to sit in tension with a stated trait — the way real, complex people sometimes contradict their own patterns. It should still make sense in hindsight, never randomly bizarre, just not predictable from the trait list alone.",
};

export async function POST(req: Request) {
  try {
    const { traits, difficulty, question, options, priorQA } = await req.json();

    if (!traits || !difficulty || !question) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI not configured" },
        { status: 500 }
      );
    }

    const difficultyInstruction =
      DIFFICULTY_INSTRUCTION[difficulty] ?? DIFFICULTY_INSTRUCTION.medium;

    const priorContext =
      Array.isArray(priorQA) && priorQA.length > 0
        ? `\n\nFor consistency, here's how this character has answered before in this session:\n${priorQA
            .map((qa: any) => `Q: ${qa.question}\nA: ${qa.answer}`)
            .join("\n\n")}`
        : "";

    const formatInstruction = options
      ? `\n\nYour answer MUST be exactly one of these options, verbatim: ${JSON.stringify(
          options
        )}`
      : `\n\nAnswer in 1-2 sentences, open-ended, first person.`;

    const systemPrompt = `You are roleplaying as a simulated person for someone practicing a relationship-deepening game — they're trying to predict how well they understand this character. Traits: ${traits}

${difficultyInstruction}

Stay in character, answer in first person as this person would, based on the traits.${priorContext}${formatInstruction}

Respond with ONLY JSON, no other text: {"answer": "..."}`;

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
            { role: "user", content: question },
          ],
          temperature: difficulty === "hard" ? 0.9 : 0.6,
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

    if (!parsed.answer) {
      throw new Error("Malformed digital friend response");
    }

    return NextResponse.json({ answer: parsed.answer });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

