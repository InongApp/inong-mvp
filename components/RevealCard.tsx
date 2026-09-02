"use client";

type RevealCardProps = {
  matched: boolean;
  yourAnswer: string;
  theirGuess: string;
  friendName: string;
  onContinue: () => void;
  continueLabel?: string;
};

export default function RevealCard({
  matched,
  yourAnswer,
  theirGuess,
  friendName,
  onContinue,
  continueLabel = "Next",
}: RevealCardProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div
        className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full text-3xl ${
          matched ? "bg-coral" : "bg-surface"
        }`}
      >
        {matched ? "❤️" : "😂"}
      </div>

      <h1 className="font-serif text-2xl font-semibold">
        {matched ? "You matched!" : `${friendName} didn't quite get it.`}
      </h1>

      <div className="mt-8 w-full space-y-3 text-left">
        <div className="rounded-card bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-mute">
            Your answer
          </p>
          <p className="mt-1 font-serif text-lg">{yourAnswer}</p>
        </div>
        <div className="rounded-card bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-mute">
            {friendName}&rsquo;s guess
          </p>
          <p className="mt-1 font-serif text-lg">{theirGuess}</p>
        </div>
      </div>

      <button
        onClick={onContinue}
        className="mt-10 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
      >
        {continueLabel}
      </button>
    </div>
  );
}
