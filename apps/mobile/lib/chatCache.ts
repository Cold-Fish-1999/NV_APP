import { Platform } from "react-native";

export interface CachedChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

const HOURS_24_MS = 24 * 60 * 60 * 1000;

function getCacheKey(userId: string): string {
  return `nvapp_chat_cache_${userId}`;
}

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem?: (key: string) => Promise<void>;
};

let nativeStorageLoader: Promise<StorageLike | null> | null = null;

async function getNativeStorage(): Promise<StorageLike | null> {
  if (Platform.OS === "web") return null;
  if (!nativeStorageLoader) {
    nativeStorageLoader = import("@react-native-async-storage/async-storage")
      .then((m) => m.default as StorageLike)
      .catch(() => null);
  }
  return nativeStorageLoader;
}

export function filterRecent24h<T extends { createdAt: string }>(items: T[]): T[] {
  const minTs = Date.now() - HOURS_24_MS;
  return items.filter((m) => {
    const ts = new Date(m.createdAt).getTime();
    return Number.isFinite(ts) && ts >= minTs;
  });
}

export async function loadChatCache(userId: string): Promise<CachedChatMessage[]> {
  const key = getCacheKey(userId);
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      if (typeof localStorage === "undefined") return [];
      raw = localStorage.getItem(key);
    } else {
      const storage = await getNativeStorage();
      if (!storage) return [];
      raw = await storage.getItem(key);
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedChatMessage[];
    return filterRecent24h(parsed).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function saveChatCache(userId: string, messages: CachedChatMessage[]): Promise<void> {
  const key = getCacheKey(userId);
  const filtered = filterRecent24h(messages).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const value = JSON.stringify(filtered);
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
    return;
  }
  const storage = await getNativeStorage();
  if (!storage) return;
  await storage.setItem(key, value);
}

export async function clearChatCache(userId: string): Promise<void> {
  const key = getCacheKey(userId);
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
    return;
  }
  const storage = await getNativeStorage();
  if (!storage) return;
  if (storage.removeItem) {
    await storage.removeItem(key);
  }
}
