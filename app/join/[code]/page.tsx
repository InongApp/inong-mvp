"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Screen = "loading" | "invalid" | "preview" | "joining" | "error";

const TYPE_LABEL: Record<string, string> = {
  one_on_one: "One-on-One",
  inner_circle: "Inner Circle",
  family: "Family",
};

export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("loading");
  const [inviterName, setInviterName] = useState("someone");
  const [roomType, setRoomType] = useState<string>("one_on_one");
  const [roomName, setRoomName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPreview() {
    const code = params.code;
    const { data, error: previewErr } = await supabase
      .rpc("get_invite_preview", { p_code: code })
      .maybeSingle();

    const preview = data as {
      valid: boolean;
      inviter_name: string | null;
      room_type: string;
      room_name: string | null;
    } | null;

    if (previewErr || !preview || !preview.valid) {
      setScreen("invalid");
      return;
    }

    setInviterName(preview.inviter_name ?? "someone");
    setRoomType(preview.room_type ?? "one_on_one");
    setRoomName(preview.room_name ?? null);
    setScreen("preview");
  }

  async function acceptInvite() {
    const code = params.code;
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      // Not logged in yet — remember the code, send them to sign up,
      // then come straight back here to finish joining automatically.
      localStorage.setItem("inong_pending_invite", code);
      router.push("/login");
      return;
    }

    setScreen("joining");
    try {
      const { data: roomIdData, error: acceptErr } = await supabase.rpc(
        "accept_invite",
        { p_code: code }
      );
      if (acceptErr) throw acceptErr;
      const roomId = roomIdData as unknown as string;

      localStorage.removeItem("inong_pending_invite");
      router.replace(`/rooms/${roomId}`);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
      setScreen("error");
    }
  }

  if (screen === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Loading invite...
      </div>
    );
  }

  if (screen === "invalid") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-mute">
          This invite link isn&rsquo;t valid, has already been used, or the
          room is full.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 rounded-full bg-coral px-6 py-3 font-medium text-ink transition hover:opacity-90"
        >
          Go to INONG
        </button>
      </div>
    );
  }

  if (screen === "joining") {
    return (
      <div className="flex flex-1 items-center justify-center text-mute">
        Connecting you...
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-mute">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 rounded-full bg-coral px-6 py-3 font-medium text-ink transition hover:opacity-90"
        >
          Go home
        </button>
      </div>
    );
  }

  // screen === "preview"
  const roomDescription =
    roomType === "one_on_one"
      ? "as their Inong"
      : `to their ${roomName ?? TYPE_LABEL[roomType]} (${TYPE_LABEL[roomType]})`;

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-coral text-3xl">
        ❤️
      </div>
      <h1 className="font-serif text-2xl font-semibold leading-snug">
        {inviterName} invited you {roomDescription}
      </h1>
      <p className="mt-4 max-w-xs text-mute">
        Accept to find out how well you two actually know each other.
      </p>
      <button
        onClick={acceptInvite}
        className="mt-10 w-full rounded-full bg-coral py-4 font-medium text-ink transition hover:opacity-90"
      >
        Accept & continue
      </button>
    </div>
  );
}

