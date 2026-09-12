"use client";

import { useRouter, useParams } from "next/navigation";

export default function SurpriseMeChooserPage() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();

  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className="font-serif text-2xl font-semibold">Surprise Me</h1>
      <p className="mt-2 text-sm text-mute">
        Two modes — pick what you're in the mood for.
      </p>

      <div className="mt-8 space-y-3">
        <button
          onClick={() => router.push(`/rooms/${params.roomId}/surprise-me/surprise`)}
          className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-coral"
        >
          <p className="font-serif text-lg text-paper">🎁 Surprise</p>
          <p className="mt-1 text-sm text-mute">
            Light, spontaneous, no pressure. Do it whenever.
          </p>
          <p className="mt-2 text-xs text-coral">
            Best for: low-effort fun, no clock, no stakes.
          </p>
        </button>

        <button
          onClick={() => router.push(`/rooms/${params.roomId}/surprise-me/dare`)}
          className="w-full rounded-card border border-mute px-5 py-4 text-left transition hover:border-coral"
        >
          <p className="font-serif text-lg text-paper">🔥 Dare</p>
          <p className="mt-1 text-sm text-mute">
            Bolder, a little more vulnerable — with a countdown timer to add
            some heat.
          </p>
          <p className="mt-2 text-xs text-coral">
            Best for: right-now energy and a bit of pressure, no penalty if
            time runs out.
          </p>
        </button>
      </div>
    </div>
  );
}

