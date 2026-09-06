"use client";

export default function BetRevealCard({
  won,
  pointsDelta,
  trueAnswer,
  chosenOption,
  pointsWagered,
  subjectName,
  bettorName,
  isBettor,
  onDoubleOrNothing,
  doublingUp,
  onContinue,
}: {
  won: boolean;
  pointsDelta: number;
  trueAnswer: string;
  chosenOption: string;
  pointsWagered: number;
  subjectName: string;
  bettorName: string;
  isBettor: boolean;
  onDoubleOrNothing: () => void;
  doublingUp: boolean;
  onContinue?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div
        className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full text-3xl ${
          won ? "bg-skyblue" : "bg-surface"
        }`}
      >
        {won ? "🔥" : "😂"}
      </div>

      <h1 className="font-serif text-2xl font-semibold">
        {won ? `${bettorName} won the bet!` : `${bettorName} lost the bet.`}
      </h1>
      <p
        className={`font-serif mt-2 text-3xl font-semibold ${
          won ? "text-skyblue" : "text-coral"
        }`}
      >
        {won ? "+" : ""}
        {pointsDelta} points
      </p>

      <div className="mt-8 w-full space-y-3 text-left">
        <div className="rounded-card bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-mute">
            {subjectName}&rsquo;s real choice
          </p>
          <p className="mt-1 font-serif text-lg">{trueAnswer}</p>
        </div>
        <div className="rounded-card bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-mute">
            {bettorName} bet {pointsWagered} points on
          </p>
          <p className="mt-1 font-serif text-lg">{chosenOption}</p>
        </div>
      </div>

      {won && isBettor && (
        <button
          onClick={onDoubleOrNothing}
          disabled={doublingUp}
          className="mt-8 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90 disabled:opacity-50"
        >
          {doublingUp ? "..." : `🎰 Double or nothing — risk ${pointsDelta}?`}
        </button>
      )}

      {onContinue && (
        <button
          onClick={onContinue}
          className="mt-4 w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
        >
          Continue
        </button>
      )}
    </div>
  );
}

