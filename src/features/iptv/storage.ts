const STORAGE_PREFIX = "retrovision-";

export const STORAGE_KEYS = {
  channelCache: "channel-cache",
  settings: "settings",
  favorites: "favorites",
  history: "history",
  settingsPrefs: "settings-prefs",
} as const;

export function loadLS<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveLS(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Ignore storage write errors.
  }
}

