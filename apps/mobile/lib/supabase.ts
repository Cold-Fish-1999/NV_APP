import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { storageGetItem, storageSetItem, storageRemoveItem } from "./storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseProxyUrl = process.env.EXPO_PUBLIC_SUPABASE_PROXY_URL;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * iOS 26 Simulator has a bug where Cloudflare-hosted domains are unreachable.
 * Route through a local proxy (scripts/supabase-proxy.mjs) during development.
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

const effectiveUrl =
  __DEV__ && Platform.OS === "ios"
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
