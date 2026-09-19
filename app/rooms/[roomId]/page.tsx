"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { checkRoomAgeMilestone, markMilestoneSeen } from "@/lib/milestones";
import { useUnreadHrefs } from "./layout";
import { ROMANTIC_STAGES, RomanticStage } from "@/lib/relationshipMode";
import { deriveLeagueKey, leagueLabel } from "@/lib/leagues";

type Member = { profile_id: string; display_name: string };
type Room = {
  id: string;
  name: string | null;
  type: "one_on_one" | "inner_circle" | "family";
  relationship_mode: "romantic" | "soulmate" | "friendship" | null;
  romantic_stage: RomanticStage;
  pair_username: string | null;
  national_board_country: string | null;
  games_played_together: number | null;
  max_members: number | null;
  created_at: string;
};

const GAMES_NEEDED_TO_COMPETE = 2;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const unreadHrefs = useUnreadHrefs();
  const [userId, setUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [startingWith, setStartingWith] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<string | null>(null);
  const [editingStage, setEditingStage] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [editingPair, setEditingPair] = useState(false);
  const [pairUsernameInput, setPairUsernameInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [savingPair, setSavingPair] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      router.replace("/login");
      return;
    }
    setUserId(session.user.id);

    const { data: roomData, error: roomErr } = await supabase
      .from("rooms")
      .select(
        "id, name, type, relationship_mode, romantic_stage, pair_username, national_board_country, games_played_together, max_members, created_at"
      )
      .eq("id", params.roomId)
      .single();

    if (roomErr || !roomData) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setRoom(roomData as Room);
    setPairUsernameInput(roomData.pair_username ?? "");
    setCountryInput(roomData.national_board_country ?? "");

    if (roomData.type === "one_on_one") {
      const found = await checkRoomAgeMilestone(roomData.id, roomData.created_at);
      if (found) {
        setMilestone(found.label);
        await markMilestoneSeen(roomData.id, found.key);
      }
    }

    const { data: memberRows } = await supabase
      .from("room_members")
      .select("profile_id, profiles(display_name)")
      .eq("room_id", params.roomId);

    const list: Member[] = (memberRows ?? []).map((m: any) => ({
      profile_id: m.profile_id,
      display_name: m.profiles?.display_name ?? "Someone",
    }));
    setMembers(list);
    setLoading(false);
  }

  async function updateStage(stage: Exclude<RomanticStage, null>) {
    if (!room) return;
    setSavingStage(true);
    try {
      const { error: updateErr } = await supabase
        .from("rooms")
        .update({ romantic_stage: stage })
        .eq("id", room.id);
      if (!updateErr) {
        setRoom({ ...room, romantic_stage: stage });
        setEditingStage(false);
      }
    } finally {
      setSavingStage(false);
    }
  }

  async function savePairProfile() {
    if (!room || !pairUsernameInput.trim() || !countryInput.trim()) return;
    setSavingPair(true);
    try {
      const { error: updateErr } = await supabase
        .from("rooms")
        .update({
          pair_username: pairUsernameInput.trim(),
          national_board_country: countryInput.trim(),
        })
        .eq("id", room.id);
      if (!updateErr) {
        setRoom({
          ...room,
          pair_username: pairUsernameInput.trim(),
          national_board_country: countryInput.trim(),
        });
        setEditingPair(false);
      }
    } finally {
      setSavingPair(false);
    }
  }

  async function generateInvite() {
    if (!userId || !room) return;
    setError(null);
    try {
      let lastErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = randomCode();
        const { error: inviteErr } = await supabase.from("room_invites").insert({
          room_id: room.id,
          invite_code: code,
          created_by: userId,
        });
        if (!inviteErr) {
          setInviteLink(`${window.location.origin}/join/${code}`);
          return;
        }
        lastErr = inviteErr;
        if (!inviteErr.message?.toLowerCase().includes("duplicate")) break;
      }
      throw lastErr ?? new Error("Couldn't generate an invite — try again.");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    }
  }

  async function startOneOnOne(otherId: string) {
    if (!userId) return;
    setStartingWith(otherId);
    setError(null);
    try {
      const { data: newRoom, error: roomErr } = await supabase
        .from("rooms")
        .insert({
          type: "one_on_one",
          name: null,
          max_members: 2,
          created_by: userId,
        })
        .select()
        .single();
      if (roomErr) throw roomErr;

      const { error: memberErr } = await supabase
        .from("room_members")
        .insert({ room_id: newRoom.id, profile_id: userId });
      if (memberErr) throw memberErr;

      router.push(`/rooms/${newRoom.id}`);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setStartingWith(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading room...
      </div>
    );
  }

  if (notFound || !room) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-mute">
          This room doesn&rsquo;t exist, or you&rsquo;re not a member of it.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 rounded-full bg-coral px-6 py-3 font-medium text-ink transition hover:opacity-90"
        >
          Go home
        </button>
      </div>
    );
  }

  const isFull = room.max_members !== null && members.length >= room.max_members;
  const partner =
    room.type === "one_on_one"
      ? members.find((m) => m.profile_id !== userId)
      : null;
  const roomTitle =
    room.type === "one_on_one"
      ? partner
        ? partner.display_name
        : "Waiting for your Inong"
      : room.name;
  const typeLabel =
    room.type === "one_on_one"
      ? "One-on-One"
      : room.type === "inner_circle"
      ? "Inner Circle"
      : "Family";
  const currentStageLabel = ROMANTIC_STAGES.find((s) => s.key === room.romantic_stage)?.label;
  const currentLeagueKey =
    room.type === "one_on_one"
      ? deriveLeagueKey(room.relationship_mode, room.romantic_stage)
      : null;
  const gamesPlayed = room.games_played_together ?? 0;
  const canCompete = gamesPlayed >= GAMES_NEEDED_TO_COMPETE;

  return (
    <div className="flex flex-1 flex-col">
      <button
        onClick={() => router.push("/rooms")}
        className="self-start text-sm text-mute hover:text-paper"
      >
        ← All rooms
      </button>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-mute">
            {typeLabel}
            {room.type === "one_on_one" && (
              <>
                {" · "}
                {room.relationship_mode === "romantic"
                  ? "❤️ Romantic"
                  : room.relationship_mode === "soulmate"
                  ? "✨ Soulmate"
                  : "🤝 Friendship"}
                {room.relationship_mode === "romantic" && currentStageLabel && (
                  <> · {currentStageLabel}</>
                )}
              </>
            )}
          </p>
          <h1 className="font-serif text-2xl font-semibold">{roomTitle}</h1>
          {room.type === "one_on_one" && room.pair_username && (
            <p className="mt-0.5 text-sm text-coral">
              🏅 {room.pair_username} · {leagueLabel(currentLeagueKey)} League
              {room.national_board_country && <> · {room.national_board_country}</>}
            </p>
          )}
          <div className="mt-1 flex gap-3">
            {room.relationship_mode === "romantic" && (
              <button
                onClick={() => setEditingStage((s) => !s)}
                className="text-xs text-coral hover:underline"
              >
                {currentStageLabel ? "Change stage" : "Set your stage"}
              </button>
            )}
            {room.type === "one_on_one" && (
              <button
                onClick={() => setEditingPair((s) => !s)}
                className="text-xs text-coral hover:underline"
              >
                Edit Pair profile
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => router.push(`/rooms/${room.id}/history`)}
          className="text-xs text-mute hover:text-paper"
        >
          History & Score
        </button>
      </div>

      {editingStage && room.relationship_mode === "romantic" && (
        <div className="mt-3 rounded-card bg-surface px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-mute">
            What stage are you in? This shapes the questions INONG™ asks.
          </p>
          <div className="mt-2 space-y-1.5">
            {ROMANTIC_STAGES.map((s) => (
              <button
                key={s.key}
                onClick={() => updateStage(s.key)}
                disabled={savingStage}
                className={`w-full rounded-card border px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
                  room.romantic_stage === s.key
                    ? "border-coral text-coral"
                    : "border-mute text-paper hover:border-paper"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {editingPair && room.type === "one_on_one" && (
        <div className="mt-3 rounded-card bg-surface px-4 py-3">
          <label className="text-xs uppercase tracking-wide text-mute">
            Pair username
          </label>
          <input
            value={pairUsernameInput}
            onChange={(e) => setPairUsernameInput(e.target.value)}
            className="mt-1 w-full rounded-card bg-ink px-3 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-coral"
          />
          <label className="mt-3 block text-xs uppercase tracking-wide text-mute">
            Country (National leaderboard)
          </label>
          <input
            value={countryInput}
            onChange={(e) => setCountryInput(e.target.value)}
            className="mt-1 w-full rounded-card bg-ink px-3 py-2 text-sm text-paper focus:outline-none focus:ring-2 focus:ring-coral"
          />
          <button
            onClick={savePairProfile}
            disabled={savingPair || !pairUsernameInput.trim() || !countryInput.trim()}
            className="mt-3 rounded-full bg-coral px-5 py-2 text-sm font-medium text-ink disabled:opacity-50"
          >
            {savingPair ? "Saving..." : "Save"}
          </button>
        </div>
      )}

      {milestone && (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-card bg-coral/10 px-4 py-3 text-sm text-coral">
          <span>🎉 {milestone}</span>
          <button
            onClick={() => setMilestone(null)}
            className="shrink-0 text-coral/60 hover:text-coral"
          >
            ✕
          </button>
        </div>
      )}

      {members.length > 0 && (
        <div className="mt-6 space-y-2">
          {members.map((m) => (
            <div
              key={m.profile_id}
              className="flex items-center justify-between rounded-card bg-surface px-4 py-3"
            >
              <span className="text-paper">
                {m.display_name}
                {m.profile_id === userId ? " (you)" : ""}
              </span>
              {room.type !== "one_on_one" && m.profile_id !== userId && (
                <button
                  onClick={() => startOneOnOne(m.profile_id)}
                  disabled={startingWith === m.profile_id}
                  className="text-xs text-coral hover:underline"
                >
                  {startingWith === m.profile_id ? "..." : "Start one-on-one"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {room.type === "one_on_one" && members.length === 2 && (
        <button
          onClick={() => router.push(`/rooms/${room.id}/just-because`)}
          className="mt-8 w-full rounded-card border-2 border-dashed border-coral/40 bg-coral/5 px-5 py-4 text-left transition hover:bg-coral/10"
        >
          <p className="font-medium text-coral">💌 Just Because</p>
          <p className="mt-0.5 text-xs text-mute">
            No game, no score — just say something.
          </p>
        </button>
      )}

      {room.type === "one_on_one" && members.length === 2 && (
        <div className="mt-4 space-y-2">
          {[
            {
              href: "know-me",
              icon: "🧠",
              label: "Know Me",
              bestFor: "Best for: discovering how well you actually know each other, one honest question at a time.",
              accent: "coral",
            },
            {
              href: "bet-on-me",
              icon: "🎯",
              label: "Bet on Me",
              bestFor: "Best for: playful confidence and risk — real stakes, not just facts.",
              accent: "skyblue",
            },
            {
              href: "memories",
              icon: "🕰️",
              label: "Our Memories",
              bestFor: "Best for: revisiting what you've already discovered and letting it sink in.",
            },
            {
              href: "visuals-in-words",
              icon: "🎨",
              label: "Visuals in Words",
              bestFor: "Best for: seeing how differently you each picture things — or a quick competitive guessing game.",
            },
            {
              href: "our-thing",
              icon: "✦",
              label: "Our INONG™ Thing",
              bestFor: "Best for: building your own private language — jokes, nicknames, stories, kept forever.",
            },
            {
              href: "surprise-me",
              icon: "🎁",
              label: "Surprise Me",
              bestFor: "Two modes: light Surprises (no pressure) or bolder Dares (with a timer).",
            },
            {
              href: "daily",
              icon: "⏳",
              label: "INONG™ 24",
              bestFor: "Best for: a daily habit — small, disappearing, keeps you both showing up.",
            },
          ].map((exp) => (
            <button
              key={exp.href}
              onClick={() => router.push(`/rooms/${room.id}/${exp.href}`)}
              className={`w-full rounded-card border px-5 py-3 text-left transition ${
                exp.accent === "coral"
                  ? "border-coral bg-coral text-ink hover:opacity-90"
                  : exp.accent === "skyblue"
                  ? "border-skyblue text-skyblue hover:bg-skyblue hover:text-ink"
                  : "border-mute text-paper hover:border-paper"
              }`}
            >
              <p className="flex items-center gap-2 font-medium">
                {exp.icon} {exp.label}
                {Array.from(unreadHrefs).some(
                  (h) => h === exp.href || h.startsWith(exp.href + "/")
                ) && <span className="h-2 w-2 shrink-0 rounded-full bg-coral" />}
              </p>
              <p
                className={`mt-0.5 text-xs ${
                  exp.accent === "coral" ? "text-ink/70" : "text-mute"
                }`}
              >
                {exp.bestFor}
              </p>
            </button>
          ))}

          {/* Compete — unlocked once the games-played gate is met. Scheduling
              (Showdown Phase 2, Step 1) is now live; actual gameplay
              (shared questions, live timer) is still to come. */}
          <button
            disabled={!canCompete}
            onClick={() => canCompete && router.push(`/rooms/${room.id}/compete`)}
            className={`w-full rounded-card border px-5 py-3 text-left transition ${
              canCompete
                ? "border-mute text-paper hover:border-paper"
                : "cursor-not-allowed border-mute/40 opacity-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">🏆 Compete</p>
              {!canCompete && (
                <span className="shrink-0 rounded-full border border-mute px-2 py-0.5 text-[10px] uppercase tracking-wide text-mute">
                  {gamesPlayed}/{GAMES_NEEDED_TO_COMPETE} games
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-mute">
              Challenge another Pair once you&rsquo;ve played {GAMES_NEEDED_TO_COMPETE} games together.
            </p>
          </button>
        </div>
      )}

      {room.type !== "one_on_one" && (
        <p className="mt-8 text-sm text-mute">
          Group experiences (Our Thing, INONG™ Court, and more) are coming
          soon — for now, start a one-on-one with anyone in this room above.
        </p>
      )}

      {!isFull && (
        <div className="mt-10">
          {inviteLink ? (
            <>
              <p className="text-sm uppercase tracking-wide text-mute">
                Share this invite link
              </p>
              <div className="mt-2 break-all rounded-card bg-surface px-4 py-4 text-sm text-paper">
                {inviteLink}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="mt-3 rounded-full border border-mute px-5 py-2 text-sm text-paper transition hover:border-paper"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
              <button
                onClick={() => router.push("/digital-friend")}
                className="mt-4 block text-sm text-coral hover:underline"
              >
                🤖 While you wait, meet Karabo →
              </button>
            </>
          ) : (
            <button
              onClick={generateInvite}
              className="w-full rounded-full border border-mute py-4 font-medium text-paper transition hover:border-paper"
            >
              Invite someone to this room
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-coral">{error}</p>}
    </div>
  );
}

