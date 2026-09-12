export const LIVE_EXPERIENCES: { href: string; icon: string; label: string }[] = [
  { href: "know-me", icon: "🧠", label: "Know Me" },
  { href: "bet-on-me", icon: "🎯", label: "Bet on Me" },
  { href: "visuals-in-words/compare", icon: "🖼️", label: "Compare" },
  { href: "visuals-in-words/guess", icon: "🕵️", label: "Guess the Picture" },
  { href: "our-thing", icon: "✦", label: "Our INONG™ Thing" },
  { href: "surprise-me/surprise", icon: "🎁", label: "Surprise" },
  { href: "surprise-me/dare", icon: "🔥", label: "Dare" },
  { href: "daily", icon: "⏳", label: "INONG™ 24" },
  { href: "just-because", icon: "💌", label: "Just Because" },
  { href: "memories", icon: "🕰️", label: "Our Memories" },
];

export function labelForHref(href: string): string {
  return LIVE_EXPERIENCES.find((e) => e.href === href)?.label ?? "the room";
}

