/**
 * @fileoverview MV3 service worker. Seeds `chrome.storage.local` with default
 * settings on install/update/startup so the popup, options, and content
 * scripts always read a fully populated record.
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  features: {
    blue_filter: true,
    desaturate: true,
    animation_mute: true,
    dark_force: false,
    brightness_cap: false,
  },
  intensity: {
    blue_filter: 50,
    desaturate: 30,
    brightness_cap: 80,
  },
  premium_unlocked: false,
  trial_start_ts: null as number | null,
  schema_version: 1,
} as const;

type StoredSettings = typeof DEFAULT_SETTINGS;

/**
 * Seed defaults on first install or when prior storage lacks a schema version.
 * On subsequent updates, fill in any keys missing from the persisted record
 * without overwriting existing user choices.
 */
async function initializeStorage(reason: chrome.runtime.OnInstalledReason): Promise<void> {
  let current: Partial<StoredSettings>;
  try {
    current = (await chrome.storage.local.get(null)) as Partial<StoredSettings>;
  } catch (err) {
    console.error("[calm-screen] chrome.storage.local.get failed (initializeStorage)", err);
    throw err;
  }

  if (reason === "install" || current.schema_version === undefined) {
    try {
      await chrome.storage.local.set(DEFAULT_SETTINGS);
    } catch (err) {
      console.error("[calm-screen] chrome.storage.local.set failed (seed defaults)", err);
      throw err;
    }
    return;
  }

  const patch: Partial<StoredSettings> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof StoredSettings)[]) {
    if (current[key] === undefined) {
      (patch as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
    }
  }
  if (Object.keys(patch).length > 0) {
    try {
      await chrome.storage.local.set(patch);
    } catch (err) {
      console.error("[calm-screen] chrome.storage.local.set failed (fill missing keys)", err);
      throw err;
    }
  }
}

try {
  chrome.runtime.onInstalled.addListener((details) => {
    initializeStorage(details.reason).catch((err) => {
      console.error("[calm-screen] initializeStorage failed", err);
    });
  });
} catch (err) {
  console.error("[calm-screen] chrome.runtime.onInstalled.addListener failed", err);
}

try {
  chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get("schema_version").then((res) => {
      if (res.schema_version === undefined) {
        return chrome.storage.local.set(DEFAULT_SETTINGS);
      }
      return undefined;
    }).catch((err) => {
      console.error("[calm-screen] onStartup check failed", err);
    });
  });
} catch (err) {
  console.error("[calm-screen] chrome.runtime.onStartup.addListener failed", err);
}
