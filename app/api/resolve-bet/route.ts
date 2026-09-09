import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { betId } = await req.json();
    if (!betId) {
      return NextResponse.json({ error: "Missing betId" }, { status: 400 });
    }

    const { data: bet } = await supabaseAdmin
      .from("bets")
      .select("id, experience_id, chosen_option, resolved, won, points_delta")
      .eq("id", betId)
      .single();

    if (!bet) {
      return NextResponse.json({ error: "Bet not found" }, { status: 404 });
    }
    if (bet.resolved) {
      return NextResponse.json({ won: bet.won, points_delta: bet.points_delta, alreadyResolved: true });
    }

    const { data: experience } = await supabaseAdmin
      .from("experiences")
      .select("question")
      .eq("id", bet.experience_id)
      .single();

    const { data: response } = await supabaseAdmin
      .from("responses")
      .select("answer")
      .eq("experience_id", bet.experience_id)
      .eq("is_prediction", false)
      .maybeSingle();

    if (!response) {
      return NextResponse.json({ pending: true });
    }

    const trueAnswer = response.answer;
    let won: boolean;

    if (trueAnswer.trim().toLowerCase() === bet.chosen_option.trim().toLowerCase()) {
      won = true;
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        won = false;
      } else {
        const systemPrompt = `You judge whether a bettor's guess correctly matches the real answer in a relationship betting game. Be GENEROUS: treat differences in wording, capitalization, spacing, or phrasing as a MATCH if the core meaning is the same. Only mark it as NOT matching if they're genuinely different choices. Respond with ONLY JSON: {"matched": true} or {"matched": false}.`;
        const userPrompt = `Question: ${experience?.question ?? ""}\nReal answer: ${trueAnswer}\nBettor's guess: ${bet.chosen_option}`;

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
        });
        if (res.ok) {
          const data = await res.json();
          const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
          won = !!parsed.matched;
        } else {
          won = false;
        }
      }
    }

    await supabaseAdmin.rpc("apply_bet_result", { p_bet_id: betId, p_won: won });

    const { data: resolved } = await supabaseAdmin
      .from("bets")
      .select("won, points_delta")
      .eq("id", betId)
      .single();

    return NextResponse.json({
      won: resolved?.won ?? won,
      points_delta: resolved?.points_delta ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

