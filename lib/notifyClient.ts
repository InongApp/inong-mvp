export async function notify(
  profileId: string,
  title: string,
  body: string,
  url: string
) {
  try {
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, title, body, url }),
    });
  } catch {
    // best-effort — a failed notification should never block gameplay
  }
}

