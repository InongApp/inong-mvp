import { NextResponse } from "next/server";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

webpush.setVapidDetails(
  "mailto:hello@inong.app",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
  try {
    const { profileId, title, body, url } = await req.json();
    if (!profileId || !title) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("profile_id", profileId);

    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const payload = JSON.stringify({
      title,
      body: body ?? "",
      url: url ?? "/",
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          } as any,
          payload
        );
        sent++;
      } catch (err: any) {
        // Subscription is dead (browser unsubscribed, uninstalled, etc.) — clean it up
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }

    return NextResponse.json({ sent });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

