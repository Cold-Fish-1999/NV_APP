import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { storageGetItem, storageSetItem, storageRemoveItem } from "./storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseProxyUrl = process.env.EXPO_PUBLIC_SUPABASE_PROXY_URL;
/** 仅当你在 iOS 模拟器里需要走本机 supabase 代理时设为 "1"（真机勿开，否则易误连 localhost） */
const useIosSupabaseProxyFlag = process.env.EXPO_PUBLIC_USE_IOS_SUPABASE_PROXY === "1";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * iOS Simulator has a bug where Cloudflare-hosted domains are unreachable.
 * Route through a local proxy (scripts/supabase-proxy.mjs) during development.
 *
 * 真机若误走 localhost 代理会连到手机自身，导致 auth（如 send OTP）Network request failed。
 * 是否使用代理由 EXPO_PUBLIC_USE_IOS_SUPABASE_PROXY=1 显式打开（见上），不依赖 expo-device。
 */
function normalizeSimulatorProxyUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (!(__DEV__ && Platform.OS === "ios")) return url;
  try {
    const u = new URL(url);
    if (u.protocol === "http:" && u.port === "54321") {
      u.hostname = "localhost";
      return u.toString().replace(/\/$/, "");
    }
    return url;
  } catch {
    return url;
  }
}

const useIosSupabaseProxy =
  __DEV__ &&
  Platform.OS === "ios" &&
  useIosSupabaseProxyFlag &&
  Boolean(supabaseProxyUrl);

const effectiveUrl = useIosSupabaseProxy
  ? (normalizeSimulatorProxyUrl(supabaseProxyUrl) ?? supabaseUrl)
  : supabaseUrl;

/** 客户端 Supabase（anon key，遵守 RLS） */
export const supabase = createClient(effectiveUrl, supabaseAnonKey, {
  auth: {
    storage: {
      getItem: storageGetItem,
      setItem: storageSetItem,
      removeItem: storageRemoveItem,
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
