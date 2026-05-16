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

async function initializeStorage(reason: chrome.runtime.OnInstalledReason): Promise<void> {
  const current = (await chrome.storage.local.get(null)) as Partial<StoredSettings>;

  if (reason === "install" || current.schema_version === undefined) {
    await chrome.storage.local.set(DEFAULT_SETTINGS);
    return;
  }

  const patch: Partial<StoredSettings> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof StoredSettings)[]) {
    if (current[key] === undefined) {
      (patch as Record<string, unknown>)[key] = DEFAULT_SETTINGS[key];
    }
  }
  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  initializeStorage(details.reason).catch((err) => {
    console.error("[calm-screen] initializeStorage failed", err);
  });
});

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
