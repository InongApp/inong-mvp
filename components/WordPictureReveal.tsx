"use client";

export default function WordPictureReveal({
  prompt,
  myDescription,
  friendDescription,
  friendName,
}: {
  prompt: string;
  myDescription: string;
  friendDescription: string;
  friendName: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-coral text-3xl">
        🎨
      </div>

      <p className="text-sm uppercase tracking-wide text-mute">The prompt</p>
      <h1 className="font-serif mt-2 text-xl font-semibold leading-snug">
        {prompt}
      </h1>

      <div className="mt-8 w-full space-y-3 text-left">
        <div className="rounded-card bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-mute">
            What you pictured
          </p>
          <p className="mt-1 text-paper">{myDescription}</p>
        </div>
        <div className="rounded-card bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-mute">
            What {friendName} pictured
          </p>
          <p className="mt-1 text-paper">{friendDescription}</p>
        </div>
      </div>

      <p className="mt-6 text-sm text-mute">
        No right answer here — just two different ways of seeing the same
        thing.
      </p>
    </div>
  );
}

