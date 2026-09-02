"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/know-me", label: "🧠 Know Me" },
  { href: "/bet-on-me", label: "🎯 Bet on Me" },
];

export default function ExperienceNav() {
  const pathname = usePathname();
  if (
    pathname === "/" ||
    pathname.startsWith("/pair") ||
    pathname.startsWith("/login")
  )
    return null;

  return (
    <div className="mt-8 flex gap-2 border-t border-surface pt-4">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex-1 rounded-full py-2 text-center text-sm transition ${
            pathname === tab.href
              ? "bg-surface text-paper"
              : "text-mute hover:text-paper"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
