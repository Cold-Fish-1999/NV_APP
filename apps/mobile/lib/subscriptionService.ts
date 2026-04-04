import { supabase } from "@/lib/supabase";

export type SubscriptionTier = "free" | "prime" | "pro";

export type SubscriptionStatus = {
  isPro: boolean;
  tier: SubscriptionTier;
  planId: string | null;
  expiresAt: string | null;
};

/**
 * Write subscription tier directly to user_entitlements in the database.
 * Used by the in-app tier switcher for dev/testing.
 */
export async function setTierInDB(userId: string, tier: SubscriptionTier): Promise<void> {
  const isPro = tier === "pro" || tier === "prime";
  const { error } = await supabase
    .from("user_entitlements")
    .upsert(
      { user_id: userId, is_pro: isPro, plan_id: tier },
      { onConflict: "user_id" }
    );
  if (error) throw new Error(`Failed to set tier: ${error.message}`);
}

/**
 * Read current subscription status from user_entitlements.
 */
export async function getSubscriptionStatus(
  userId: string
): Promise<SubscriptionStatus | null> {
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("is_pro, plan_id, expires_at")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { isPro: false, tier: "free", planId: null, expiresAt: null };
    }
    console.warn("[subscription] fetch error:", error);
    return null;
  }

  const expiresAt = data.expires_at;
  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
  const isPro = data.is_pro && !isExpired;

  let tier: SubscriptionTier = "free";
  if (isPro) {
    tier = data.plan_id === "prime" ? "prime" : "pro";
  }

  return {
    isPro,
    tier,
    planId: data.plan_id,
    expiresAt: data.expires_at,
  };
}
