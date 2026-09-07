"use client";

import { useRouter, useParams } from "next/navigation";

export default function VisualsInWordsChooserPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();

  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className="font-serif text-2xl font-semibold">Visuals in Words</h1>
      <p className="mt-2 text-sm text-mute">Pick how you want to play.</p>

      <div className="mt-8 space-y-3">
        <button
          onClick={() => router.push(`/rooms/${params.roomId}/visuals-in-words/compare`)}
          className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-coral"
        >
          <p className="font-serif text-lg text-paper">🖼️ Compare</p>
          <p className="mt-1 text-sm text-mute">
            Same prompt, two descriptions. No score — just see how
            differently you each picture things.
          </p>
        </button>

        <button
          onClick={() => router.push(`/rooms/${params.roomId}/visuals-in-words/guess`)}
          className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-coral"
        >
          <p className="font-serif text-lg text-paper">🕵️ Guess the Picture</p>
          <p className="mt-1 text-sm text-mute">
            One of you knows what it is. Guess right on the first clue for 3
            points, or ask for a second clue and play it safer for 1.
          </p>
        </button>
      </div>
    </div>
  );
}

