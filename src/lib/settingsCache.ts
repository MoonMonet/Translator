const CACHE_FILE = "cache.json";
const LEGACY_FILE = "settings.json";

const CACHE_KEYS = [
  "lastUpdateCheck",
  "cachedChangelog",
  "cachedChangelogVersion",
  "lastSeenVersion",
  "popupSourceLang",
  "popupTargetLang",
];

export async function loadCache() {
  const { load } = await import("@tauri-apps/plugin-store");
  const cache = await load(CACHE_FILE, { defaults: {} });

  if ((await cache.keys()).length > 0) return cache;

  try {
    const legacy = await load(LEGACY_FILE, { defaults: {}, autoSave: false });

    // The store plugin force-saves every open store on exit, which would write
    // this stale snapshot over the settings the Rust side owns.
    try {
      let migrated = false;

      for (const key of CACHE_KEYS) {
        const value = await legacy.get(key);
        if (value !== undefined) {
          await cache.set(key, value);
          migrated = true;
        }
      }

      if (migrated) await cache.save();
    } finally {
      await legacy.close();
    }
  } catch {}

  return cache;
}
