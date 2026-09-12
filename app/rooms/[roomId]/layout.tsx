"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LIVE_EXPERIENCES, labelForHref } from "@/lib/experienceNav";
import { getUnreadHrefs, markExperienceRead } from "@/lib/unreadComments";

const UnreadContext = createContext<Set<string>>(new Set());
export function useUnreadHrefs() {
  return useContext(UnreadContext);
}

function currentHrefFromPath(pathname: string, roomId: string): string | null {
  const prefix = `/rooms/${roomId}/`;
  if (!pathname.startsWith(prefix)) return null;
  return pathname.slice(prefix.length).replace(/\/$/, "");
}

export default function RoomLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ roomId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [partnerNudge, setPartnerNudge] = useState<{ href: string; label: string } | null>(null);
  const [dismissedHref, setDismissedHref] = useState<string | null>(null);
  const [unreadHrefs, setUnreadHrefs] = useState<Set<string>>(new Set());

  const currentHref = currentHrefFromPath(pathname, params.roomId);

  // Heartbeat: tell the room where I am right now, and mark this
  // experience read the moment I visit it — visiting counts as reading.
  useEffect(() => {
    if (!currentHref) return;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      setUserId(session.user.id);
      await supabase.from("room_activity").upsert(
        {
          room_id: params.roomId,
          profile_id: session.user.id,
          experience_href: currentHref,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "room_id,profile_id" }
      );
      await markExperienceRead(params.roomId, session.user.id, currentHref);
      setUnreadHrefs((prev) => {
        const next = new Set(prev);
        next.delete(currentHref);
        return next;
      });
    })();
  }, [currentHref, params.roomId]);

  // Poll for the partner's activity — this is what lets one experience
  // "know" the other person just moved to a different one.
  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      const { data } = await supabase
        .from("room_activity")
        .select("profile_id, experience_href, updated_at")
        .eq("room_id", params.roomId)
        .neq("profile_id", userId)
        .maybeSingle();

      if (!data) return;
      const ageSeconds = (Date.now() - new Date(data.updated_at).getTime()) / 1000;
      const isRecent = ageSeconds < 180; // only nudge if they're likely still there
      const isDifferent = data.experience_href !== currentHref;
      const alreadyDismissed = data.experience_href === dismissedHref;

      if (isRecent && isDifferent && !alreadyDismissed) {
        setPartnerNudge({ href: data.experience_href, label: labelForHref(data.experience_href) });
      } else if (!isDifferent) {
        setPartnerNudge(null);
      }
    };
    check();
    const interval = setInterval(check, 6000);
    return () => clearInterval(interval);
  }, [userId, params.roomId, currentHref, dismissedHref]);

  // Poll for unread comments across every experience in this room.
  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      const unread = await getUnreadHrefs(params.roomId, userId);
      unread.delete(currentHref ?? ""); // never badge the page I'm already on
      setUnreadHrefs(unread);
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [userId, params.roomId, currentHref]);

  return (
    <UnreadContext.Provider value={unreadHrefs}>
      <div className="flex flex-1 flex-col">
        {partnerNudge && (
          <button
            onClick={() => {
              router.push(`/rooms/${params.roomId}/${partnerNudge.href}`);
              setPartnerNudge(null);
            }}
            className="mb-3 flex items-center justify-between gap-2 rounded-card bg-skyblue/10 px-4 py-3 text-left text-sm text-skyblue"
          >
            <span>🎯 Your Inong is in {partnerNudge.label} — join them?</span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                setDismissedHref(partnerNudge.href);
                setPartnerNudge(null);
              }}
              className="shrink-0 text-skyblue/60 hover:text-skyblue"
            >
              ✕
            </span>
          </button>
        )}

        <div className="relative mb-2">
          <button
            onClick={() => setShowSwitcher((s) => !s)}
            className="flex items-center gap-1 text-xs text-mute hover:text-paper"
          >
            🔀 Switch experience
            {unreadHrefs.size > 0 && (
              <span className="ml-1 h-2 w-2 rounded-full bg-coral" />
            )}
          </button>
          {showSwitcher && (
            <div className="absolute left-0 top-6 z-10 w-64 rounded-card border border-mute bg-ink p-2 shadow-lg">
              {LIVE_EXPERIENCES.map((exp) => (
                <button
                  key={exp.href}
                  onClick={() => {
                    router.push(`/rooms/${params.roomId}/${exp.href}`);
                    setShowSwitcher(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-card px-3 py-2 text-left text-sm transition hover:bg-surface ${
                    currentHref === exp.href ? "text-coral" : "text-paper"
                  }`}
                >
                  <span>{exp.icon}</span>
                  <span className="flex-1">{exp.label}</span>
                  {unreadHrefs.has(exp.href) && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-coral" />
                  )}
                  {currentHref === exp.href && <span className="text-xs">●</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {children}
      </div>
    </UnreadContext.Provider>
  );
}

