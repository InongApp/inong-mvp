"use client";

export default function WordsRoundRecap({
  roundNumber,
  typeLabel,
  friendName,
  onStartNext,
  starting,
}: {
  roundNumber: number;
  typeLabel?: string | null;
  friendName: string;
  onStartNext: () => void;
  starting: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-coral text-3xl">
        🎨
      </div>
      <p className="text-sm uppercase tracking-wide text-mute">
        Round {roundNumber}
        {typeLabel ? ` — ${typeLabel}` : ""} complete
      </p>
      <h1 className="font-serif mt-3 text-2xl font-semibold">
        5 word-pictures painted together
      </h1>
      <p className="mt-3 max-w-xs text-mute">
        Some the same, some worlds apart — that&rsquo;s the whole point.
      </p>

      <p className="mt-8 text-sm text-mute">
        Ready when {friendName} is for round {roundNumber + 1}.
      </p>
      <button
        onClick={onStartNext}
        disabled={starting}
        className="mt-4 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
      >
        {starting ? "..." : `Start round ${roundNumber + 1}`}
      </button>
    </div>
  );
}

