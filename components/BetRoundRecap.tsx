"use client";

type Discovery = { id: string; summary: string };

export default function BetRoundRecap({
  roundNumber,
  typeLabel,
  netPoints,
  balance,
  friendName,
  discoveries,
  onStartNext,
  starting,
}: {
  roundNumber: number;
  typeLabel?: string | null;
  netPoints: number;
  balance: number;
  friendName: string;
  discoveries: Discovery[];
  onStartNext: () => void;
  starting: boolean;
}) {
  const verdict =
    netPoints > 0
      ? "Confidence paid off this round. 🔥"
      : netPoints < 0
      ? "Rough round — but every bet is a story."
      : "A wash — nobody moved the needle this round.";

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-sm uppercase tracking-wide text-mute">
        Round {roundNumber}
        {typeLabel ? ` — ${typeLabel}` : ""} complete
      </p>
      <p
        className={`font-serif mt-3 text-3xl font-semibold ${
          netPoints >= 0 ? "text-skyblue" : "text-coral"
        }`}
      >
        {netPoints >= 0 ? "+" : ""}
        {netPoints} points this round
      </p>
      <p className="mt-2 text-sm text-mute">Balance now: {balance} points</p>
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
        Ready when {friendName} is for round {roundNumber + 1}.
      </p>
      <button
        onClick={onStartNext}
        disabled={starting}
        className="mt-4 w-full rounded-full bg-skyblue py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
      >
        {starting ? "..." : `Start round ${roundNumber + 1}`}
      </button>
    </div>
  );
}

