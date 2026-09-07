import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const { experienceId, roomId, guesserProfileId, guessAnswer, cluesUsed } =
      await req.json();

    if (!experienceId || !roomId || !guesserProfileId || !guessAnswer || !cluesUsed) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Idempotent fast-path: if this experience already has a result, return
    // it rather than re-judging (and never double-apply points).
    const { data: existing } = await supabaseAdmin
      .from("guess_results")
      .select("correct, points, guess_answer")
      .eq("experience_id", experienceId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        correct: existing.correct,
        points: existing.points,
        alreadyResolved: true,
      });
    }

    const { data: experience } = await supabaseAdmin
      .from("experiences")
      .select("correct_answer, question, clue_1, clue_2")
      .eq("id", experienceId)
      .single();

    if (!experience?.correct_answer) {
      return NextResponse.json(
        { error: "This experience has no correct answer set." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    let correct = false;

    if (apiKey) {
      const systemPrompt = `You judge whether a guess correctly identifies a "what am I looking at" picture-riddle answer. Be GENEROUS with wording, spelling, capitalization, and synonyms — if the guess clearly identifies the same thing as the real answer, it's correct, even if worded very differently. Only mark it wrong if it's genuinely a different thing. Respond with ONLY JSON: {"correct": true} or {"correct": false}.`;
      const userPrompt = `Real answer: ${experience.correct_answer}\nGuess: ${guessAnswer}`;

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
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      });
      if (response.ok) {
        const data = await response.json();
        const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
        correct = !!parsed.correct;
      }
    } else {
      // No AI configured — fall back to a lenient exact-ish comparison
      correct =
        guessAnswer.trim().toLowerCase() ===
        experience.correct_answer.trim().toLowerCase();
    }

    const points = correct ? (cluesUsed === 1 ? 3 : 1) : 0;

    const { error: insertErr } = await supabaseAdmin.from("guess_results").insert({
      experience_id: experienceId,
      guesser_profile_id: guesserProfileId,
      guess_answer: guessAnswer,
      clues_used: cluesUsed,
      correct,
      points,
    });

    if (insertErr) {
      // Someone else already resolved this the moment we were judging —
      // safe to treat as already-resolved rather than an error.
      if ((insertErr as any).code === "23505") {
        const { data: raceWinner } = await supabaseAdmin
          .from("guess_results")
          .select("correct, points")
          .eq("experience_id", experienceId)
          .single();
        return NextResponse.json({
          correct: raceWinner?.correct ?? correct,
          points: raceWinner?.points ?? points,
          alreadyResolved: true,
        });
      }
      throw insertErr;
    }

    if (points > 0) {
      await supabaseAdmin.rpc("apply_guess_points", {
        p_room_id: roomId,
        p_profile_id: guesserProfileId,
        p_points: points,
      });
    }

    return NextResponse.json({ correct, points });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

