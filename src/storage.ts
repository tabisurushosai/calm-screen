/**
 * @fileoverview Typed wrapper around `chrome.storage.local`. Owns the canonical
 * settings shape (`Settings`), defaults, premium-feature registry, and the
 * subscribe helper used by the content script to react to setting changes.
 */

/** Identifier for each user-visible visual-comfort feature. */
export type FeatureKey =
  | "blue_filter"
  | "desaturate"
  | "animation_mute"
  | "dark_force"
  | "brightness_cap";

/** Strength level applied uniformly across active features. */
export type Intensity = "low" | "medium" | "high";

/** Persistent settings shape stored under `chrome.storage.local`. */
export interface Settings {
  enabled: boolean;
  features: Record<FeatureKey, boolean>;
  intensity: Intensity;
  premium_unlocked: boolean;
  trial_start_ts: number | null;
  schema_version: number;
}

export const SCHEMA_VERSION = 1;

export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const PREMIUM_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "brightness_cap",
]);

export const FEATURE_KEYS: readonly FeatureKey[] = [
  "blue_filter",
  "desaturate",
  "animation_mute",
  "dark_force",
  "brightness_cap",
] as const;

export const INTENSITY_VALUES: readonly Intensity[] = ["low", "medium", "high"] as const;

export const DEFAULTS: Settings = {
  enabled: true,
  features: {
    blue_filter: true,
    desaturate: true,
    animation_mute: true,
    dark_force: false,
    brightness_cap: false,
  },
  intensity: "medium",
  premium_unlocked: false,
  trial_start_ts: null,
  schema_version: SCHEMA_VERSION,
};

function isIntensity(value: unknown): value is Intensity {
  return typeof value === "string" && (INTENSITY_VALUES as readonly string[]).includes(value);
}

function coerceFeatures(raw: unknown): Record<FeatureKey, boolean> {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<FeatureKey, unknown>>;
  const out = {} as Record<FeatureKey, boolean>;
  for (const key of FEATURE_KEYS) {
    const v = source[key];
    out[key] = typeof v === "boolean" ? v : DEFAULTS.features[key];
  }
  return out;
}

async function storageGet(
  keys: string | string[] | null,
  context: string,
): Promise<Record<string, unknown>> {
  try {
    return (await chrome.storage.local.get(keys)) as Record<string, unknown>;
  } catch (err) {
    console.error(`[calm-screen] chrome.storage.local.get failed (${context})`, err);
    throw err;
  }
}

async function storageSet(
  items: Record<string, unknown>,
  context: string,
): Promise<void> {
  try {
    await chrome.storage.local.set(items);
  } catch (err) {
    console.error(`[calm-screen] chrome.storage.local.set failed (${context})`, err);
    throw err;
  }
}

/**
 * Read the persisted settings, coercing each field to its expected type and
 * substituting `DEFAULTS` for any missing/corrupted value. Always returns a
 * fully populated `Settings` object so callers do not need to null-check.
 */
export async function loadSettings(): Promise<Settings> {
  const raw = (await storageGet(
    [
      "enabled",
      "features",
      "intensity",
      "premium_unlocked",
      "trial_start_ts",
      "schema_version",
    ],
    "loadSettings",
  )) as Partial<Record<keyof Settings, unknown>>;

  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULTS.enabled,
    features: coerceFeatures(raw.features),
    intensity: isIntensity(raw.intensity) ? raw.intensity : DEFAULTS.intensity,
    premium_unlocked:
      typeof raw.premium_unlocked === "boolean" ? raw.premium_unlocked : DEFAULTS.premium_unlocked,
    trial_start_ts:
      typeof raw.trial_start_ts === "number" ? raw.trial_start_ts : DEFAULTS.trial_start_ts,
    schema_version:
      typeof raw.schema_version === "number" ? raw.schema_version : DEFAULTS.schema_version,
  };
}

/** Merge a partial settings patch into storage; no validation is performed. */
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await storageSet(patch, "saveSettings");
}

/** Toggle the master on/off switch shown in the popup. */
export async function setMasterEnabled(enabled: boolean): Promise<void> {
  await storageSet({ enabled }, "setMasterEnabled");
}

/**
 * Persist a single feature toggle while preserving the other feature flags.
 * Internally re-coerces the current map so a corrupted record self-heals.
 */
export async function setFeature(key: FeatureKey, value: boolean): Promise<void> {
  const current = (await storageGet("features", "setFeature")) as {
    features?: Record<FeatureKey, boolean>;
  };
  const next = { ...coerceFeatures(current.features), [key]: value };
  await storageSet({ features: next }, "setFeature");
}

/** Persist the global intensity level. */
export async function setIntensity(intensity: Intensity): Promise<void> {
  await storageSet({ intensity }, "setIntensity");
}

/** Stamp `now` as the trial start, kicking off the 7-day premium trial. */
export async function startTrial(now: number = Date.now()): Promise<void> {
  await storageSet({ trial_start_ts: now }, "startTrial");
}

/** Flip the paid-premium flag (called after Stripe webhook confirmation). */
export async function setPremiumUnlocked(unlocked: boolean): Promise<void> {
  await storageSet({ premium_unlocked: unlocked }, "setPremiumUnlocked");
}

/**
 * Reset `enabled`, `features`, and `intensity` back to defaults. Premium and
 * trial state are intentionally preserved so a "reset" cannot grant a second
 * trial period.
 */
export async function resetToDefaults(): Promise<void> {
  await storageSet(
    {
      enabled: DEFAULTS.enabled,
      features: DEFAULTS.features,
      intensity: DEFAULTS.intensity,
    },
    "resetToDefaults",
  );
}

/**
 * Days left in the trial, rounded up. Returns `0` once the window has lapsed
 * or when no trial has been started.
 */
export function trialDaysRemaining(
  trialStartTs: number | null,
  now: number = Date.now(),
): number {
  if (!trialStartTs) return 0;
  const elapsed = now - trialStartTs;
  const remaining = Math.ceil((TRIAL_DURATION_MS - elapsed) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

/**
 * `true` when the user has either paid for premium or is still inside the
 * trial window. The richer status object lives in `premium.ts`.
 */
export function isPremiumActive(
  settings: Pick<Settings, "premium_unlocked" | "trial_start_ts">,
  now: number = Date.now(),
): boolean {
  if (settings.premium_unlocked) return true;
  return trialDaysRemaining(settings.trial_start_ts, now) > 0;
}

/** Callback invoked with the freshly loaded settings plus raw change deltas. */
export type SettingsChangeHandler = (
  next: Settings,
  changes: { [K in keyof Settings]?: { oldValue?: Settings[K]; newValue?: Settings[K] } },
) => void;

/**
 * Subscribe to `chrome.storage.local` changes for any tracked settings key.
 * Reloads and re-validates the full `Settings` object before invoking
 * `handler`, so subscribers never see partial state.
 *
 * @returns An unsubscribe function that removes the underlying listener.
 */
export function onSettingsChanged(handler: SettingsChangeHandler): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: chrome.storage.AreaName,
  ): void => {
    if (areaName !== "local") return;
    const tracked: (keyof Settings)[] = [
      "enabled",
      "features",
      "intensity",
      "premium_unlocked",
      "trial_start_ts",
      "schema_version",
    ];
    const touched = tracked.some((k) => k in changes);
    if (!touched) return;

    loadSettings()
      .then((next) => {
        handler(next, changes as Parameters<SettingsChangeHandler>[1]);
      })
      .catch((err) => {
        console.error("[calm-screen] onSettingsChanged loadSettings failed", err);
      });
  };

  try {
    chrome.storage.onChanged.addListener(listener);
  } catch (err) {
    console.error("[calm-screen] chrome.storage.onChanged.addListener failed", err);
  }
  return () => {
    try {
      chrome.storage.onChanged.removeListener(listener);
    } catch (err) {
      console.error("[calm-screen] chrome.storage.onChanged.removeListener failed", err);
    }
  };
}
