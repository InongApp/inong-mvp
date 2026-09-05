"use client";

type Discovery = { id: string; summary: string };

export default function RoundRecap({
  roundNumber,
  typeLabel,
  matches,
  total,
  friendName,
  discoveries,
  onStartNext,
  starting,
  accent = "coral",
}: {
  roundNumber: number;
  typeLabel?: string | null;
  matches: number;
  total: number;
  friendName: string;
  discoveries: Discovery[];
  onStartNext: () => void;
  starting: boolean;
  accent?: "coral" | "skyblue";
}) {
  const verdict =
    total === 0
      ? "No questions answered yet."
      : matches / total >= 0.8
      ? "You two are seriously in sync. 🔥"
      : matches / total >= 0.5
      ? "Good instincts — there's more to uncover."
      : "Plenty to learn about each other still — that's the fun part.";

  const accentClass = accent === "coral" ? "text-coral" : "text-skyblue";
  const bgClass = accent === "coral" ? "bg-coral" : "bg-skyblue";

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-sm uppercase tracking-wide text-mute">
        Round {roundNumber}
        {typeLabel ? ` — ${typeLabel}` : ""} complete
      </p>
      <p className={`font-serif mt-3 text-3xl font-semibold ${accentClass}`}>
        {matches}/{total} matched
      </p>
      <p className="mt-3 max-w-xs text-mute">{verdict}</p>

      {discoveries.length > 0 && (
        <div className="mt-6 w-full space-y-2 text-left">
          <p className="text-xs uppercase tracking-wide text-mute">
            What you discovered
          </p>
          {discoveries.map((d) => (
            <div
              key={d.id}
              className="rounded-card bg-surface px-4 py-3 text-sm text-paper"
            >
              {d.summary}
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 text-sm text-mute">
        That was fun. Ready when {friendName} is for round {roundNumber + 1}.
      </p>
      <button
        onClick={onStartNext}
        disabled={starting}
        className={`mt-4 w-full rounded-full py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50 ${bgClass}`}
      >
        {starting ? "..." : `Start round ${roundNumber + 1}`}
      </button>
    </div>
  );
}

