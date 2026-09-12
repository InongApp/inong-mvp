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

    // Semantic deduplication: check against recent discoveries so the same
    // underlying truth, reworded, doesn't pile up as separate "new" entries.
    const { data: recentDiscoveries } = await supabaseAdmin
      .from("discoveries")
      .select("id, summary")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(15);

    // Numbered list + index-based matching — far more reliable than asking
    // the model to reproduce existing text verbatim, which LLMs often
    // paraphrase even when told not to, silently breaking a string match.
    const existingList = (recentDiscoveries ?? [])
      .map((d: any, i: number) => `${i + 1}. ${d.summary}`)
      .join("\n");

    const systemPrompt = `You extract durable, meaningful relationship discoveries from one Q&A exchange in a relationship-deepening game. A discovery is a genuine, specific insight about the person worth remembering long-term — a goal, fear, value, preference, formative memory, contradiction, or dream. Most everyday answers do NOT contain a real discovery — only flag one if it's actually meaningful, never for small talk or a trivial preference.

IMPORTANT — check for duplicates first. Here is what's already known about this relationship, numbered:
${existingList || "(nothing yet)"}

If this answer is substantively the SAME insight as one of the numbered items above (even worded differently), respond with {"discovery": null, "reinforces_index": <the number>} — do NOT create a duplicate entry for something already known.

If it's genuinely new, respond with {"discovery": "one sentence, third person, e.g. 'Wants to open a restaurant someday'", "category": "one short lowercase category word", "reinforces_index": null}.

If there's nothing noteworthy at all, respond with {"discovery": null, "reinforces_index": null}.

Respond with ONLY JSON, no other text.`;

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
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");

    // Case 1: reinforces an existing discovery — update it, don't duplicate
    if (parsed.reinforces_index != null) {
      const match = (recentDiscoveries ?? [])[parsed.reinforces_index - 1];
      if (match) {
        // Supabase JS can't do `column = column + 1` directly — read then
        // write. Low contention risk since only one round resolves at a time.
        const { data: current } = await supabaseAdmin
          .from("discoveries")
          .select("reinforcement_count")
          .eq("id", match.id)
          .single();
        await supabaseAdmin
          .from("discoveries")
          .update({
            reinforcement_count: (current?.reinforcement_count ?? 1) + 1,
            last_reinforced_at: new Date().toISOString(),
          })
          .eq("id", match.id);
        return NextResponse.json({ discovery: null, reinforced: match.id });
      }
      // Index was out of range — treat as no discovery rather than guessing.
      return NextResponse.json({ discovery: null });
    }

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

    if (insertErr) {
      if ((insertErr as any).code === "23505") {
        return NextResponse.json({ discovery: null, skipped: true });
      }
      throw insertErr;
    }

    return NextResponse.json({ discovery: inserted });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

