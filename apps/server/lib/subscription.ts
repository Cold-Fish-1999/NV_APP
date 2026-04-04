import { supabaseAdmin } from "./supabase";

/**
 * 检查用户是否为付费用户（Pro/Prime）
 * user_entitlements 中 is_pro=true 视为付费
 */
export async function isPaidUser(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_entitlements")
    .select("is_pro, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return false;
  if (!data.is_pro) return false;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
  return true;
}
