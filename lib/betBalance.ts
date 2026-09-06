import { supabase } from "@/lib/supabase";

export const STARTING_BALANCE = 500;

export async function getBalance(
  roomId: string,
  profileId: string
): Promise<number> {
  const { data } = await supabase
    .from("bet_balances")
    .select("points")
    .eq("room_id", roomId)
    .eq("profile_id", profileId)
    .maybeSingle();
  return data?.points ?? STARTING_BALANCE;
}

export const WAGER_PRESETS = [10, 50, 100, 200, 500];

