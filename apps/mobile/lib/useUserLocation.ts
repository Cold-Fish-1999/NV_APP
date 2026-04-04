import { useState, useEffect } from "react";
import * as Location from "expo-location";
import { storageGetItem, storageSetItem } from "./storage";

export interface Coords {
  latitude: number;
  longitude: number;
}

const CACHE_KEY = "user_location";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedLocation {
  coords: Coords;
  ts: number;
}

function isFresh(cached: CachedLocation): boolean {
  return Date.now() - cached.ts < CACHE_TTL_MS;
}

async function loadCached(): Promise<Coords | null> {
  try {
    const raw = await storageGetItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedLocation = JSON.parse(raw);
    if (parsed.coords && isFresh(parsed)) return parsed.coords;
  } catch {}
  return null;
}

async function saveCache(coords: Coords): Promise<void> {
  const val: CachedLocation = { coords, ts: Date.now() };
  await storageSetItem(CACHE_KEY, JSON.stringify(val));
}

async function requestLocation(): Promise<Coords | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;

  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Low,
  });
  return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
}

/**
 * Returns the user's approximate coordinates (city-level).
 * Caches the result for 24h to avoid repeated permission prompts / GPS lookups.
 */
export function useUserLocation(): Coords | null {
  const [coords, setCoords] = useState<Coords | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const cached = await loadCached();
        if (cached) {
          if (!cancelled) setCoords(cached);
          return;
        }

        const fresh = await requestLocation();
        if (cancelled) return;
        if (fresh) {
          setCoords(fresh);
          await saveCache(fresh);
        }
      } catch {
        // Location unavailable — fall back to default coords in weatherApi
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return coords;
}
