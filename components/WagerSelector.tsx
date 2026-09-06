"use client";

import { WAGER_PRESETS } from "@/lib/betBalance";

export default function WagerSelector({
  balance,
  value,
  onChange,
}: {
  balance: number;
  value: number | null;
  onChange: (amount: number) => void;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-mute">
        How much are you wagering?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {WAGER_PRESETS.map((amount) => {
          const disabled = amount > balance;
          const selected = value === amount;
          return (
            <button
              key={amount}
              disabled={disabled}
              onClick={() => onChange(amount)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                disabled
                  ? "cursor-not-allowed border border-mute/40 text-mute/40"
                  : selected
                  ? "bg-skyblue text-ink"
                  : "border border-mute text-paper hover:border-paper"
              }`}
            >
              {amount}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-mute">Your balance: {balance} points</p>
    </div>
  );
}

