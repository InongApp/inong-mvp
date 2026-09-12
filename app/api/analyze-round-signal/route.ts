import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const VALID_TONES = ["playful", "warm", "tense", "neutral", "surprised"];

export async function POST(req: Request) {
  let claimedRoundId: string | null = null;

  try {
    const { roundId } = await req.json();
    if (!roundId) {
      return NextResponse.json({ error: "Missing roundId" }, { status: 400 });
    }

    const { data: round } = await supabaseAdmin
      .from("experience_rounds")
      .select("id, type, tone")
      .eq("id", roundId)
      .single();

    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }
    if (round.tone) {
      return NextResponse.json({ skipped: true }); // already analyzed
    }

    // Atomic claim: only proceed if THIS call is the one that flips tone
    // from null to "pending" — closes the race where both people's
    // browsers complete the round within the same instant and both would
    // otherwise pass the check above before either writes, doubling the
    // AI cost. Only the winner of this update gets a row back.
    const { data: claimed } = await supabaseAdmin
      .from("experience_rounds")
      .update({ tone: "pending" })
      .eq("id", roundId)
      .is("tone", null)
      .select("id")
      .maybeSingle();

    if (!claimed) {
      return NextResponse.json({ skipped: true }); // someone else claimed it first
    }
    claimedRoundId = roundId; // now responsible for releasing this on any failure below

    const { data: experiences } = await supabaseAdmin
      .from("experiences")
      .select("id, created_at, options, ai_matched")
      .eq("round_id", roundId);
    const expIds = (experiences ?? []).map((e: any) => e.id);

    if (expIds.length === 0) {
      await supabaseAdmin
        .from("experience_rounds")
        .update({ tone: null })
        .eq("id", roundId);
      return NextResponse.json({ skipped: true });
    }

    let totalLatency = 0;
    let latencyCount = 0;
    let matches = 0;
    let completed = 0;

    if (round.type === "visuals_guess") {
      const { data: results } = await supabaseAdmin
        .from("guess_results")
        .select("experience_id, correct, created_at")
        .in("experience_id", expIds);

      for (const exp of experiences ?? []) {
        const result = (results ?? []).find((r: any) => r.experience_id === exp.id);
        if (!result) continue;
        completed++;
        if (result.correct) matches++;
        const latencySec =
          (new Date(result.created_at).getTime() - new Date(exp.created_at).getTime()) / 1000;
        if (latencySec >= 0) {
          totalLatency += latencySec;
          latencyCount++;
        }
      }
    } else {
      const { data: responses } = await supabaseAdmin
        .from("responses")
        .select("experience_id, answer, is_prediction, created_at")
        .in("experience_id", expIds);

      for (const exp of experiences ?? []) {
        const rs = (responses ?? []).filter((r: any) => r.experience_id === exp.id);
        if (rs.length < 2) continue;
        completed++;

        const times = rs.map((r: any) => new Date(r.created_at).getTime());
        const latestResponseTime = Math.max(...times);
        const latencySec = (latestResponseTime - new Date(exp.created_at).getTime()) / 1000;
        if (latencySec >= 0) {
          totalLatency += latencySec;
          latencyCount++;
        }

        const self = rs.find((r: any) => !r.is_prediction);
        const pred = rs.find((r: any) => r.is_prediction);
        const hasOptions = !!(exp as any).options && (exp as any).options.length > 0;
        const isMatch = hasOptions
          ? self?.answer === pred?.answer
          : (exp as any).ai_matched === true;
        if (isMatch) matches++;
      }
    }

    const avgResponseSeconds = latencyCount > 0 ? totalLatency / latencyCount : null;
    const matchRate = completed > 0 ? matches / completed : null;

    let tone = "quiet";
    const { data: comments } = await supabaseAdmin
      .from("experience_comments")
      .select("message")
      .in("experience_id", expIds);
    const commentText = (comments ?? []).map((c: any) => c.message).join("\n");

    if (commentText.trim().length > 0) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        const systemPrompt = `Classify the overall emotional tone of this conversation between two close people playing a relationship game together. Respond with ONLY one word, no punctuation, from exactly this list: playful, warm, tense, neutral, surprised.`;
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
              { role: "user", content: commentText.slice(0, 2000) },
            ],
            temperature: 0.3,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const word = (data.choices?.[0]?.message?.content ?? "").trim().toLowerCase();
          if (VALID_TONES.includes(word)) tone = word;
        }
      }
    }

    await supabaseAdmin
      .from("experience_rounds")
      .update({
        tone,
        avg_response_seconds: avgResponseSeconds,
        match_rate: matchRate,
      })
      .eq("id", roundId);

    return NextResponse.json({ tone, avgResponseSeconds, matchRate });
  } catch (e: any) {
    // If we'd already claimed this round (flipped tone to "pending") before
    // the failure, release the claim so a future call can retry instead of
    // leaving it stuck at "pending" forever.
    if (claimedRoundId) {
      try {
        await supabaseAdmin
          .from("experience_rounds")
          .update({ tone: null })
          .eq("id", claimedRoundId);
      } catch {
        // best-effort release — if even this fails, the round stays at
        // "pending" until manually cleared, but the original error below
        // is still surfaced rather than swallowed
      }
    }
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

