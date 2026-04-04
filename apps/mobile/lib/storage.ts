/**
 * Storage abstraction with fallback when AsyncStorage native module is unavailable.
 * Fixes "Native module is null, cannot access legacy storage" on some Expo/RN setups.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const memoryFallback = new Map<string, string>();
let useFallback: boolean | null = null;

async function ensureStorage() {
  if (useFallback !== null) return;
  try {
    await AsyncStorage.getItem("__storage_test__");
    useFallback = false;
  } catch {
    useFallback = true;
  }
}

export async function storageGetItem(key: string): Promise<string | null> {
  await ensureStorage();
  if (useFallback) return memoryFallback.get(key) ?? null;
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    useFallback = true;
    return memoryFallback.get(key) ?? null;
  }
}

export async function storageSetItem(key: string, value: string): Promise<void> {
  await ensureStorage();
  if (useFallback) {
    memoryFallback.set(key, value);
    return;
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    useFallback = true;
    memoryFallback.set(key, value);
  }
}

export async function storageRemoveItem(key: string): Promise<void> {
  await ensureStorage();
  if (useFallback) {
    memoryFallback.delete(key);
    return;
  }
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    useFallback = true;
    memoryFallback.delete(key);
  }
}
