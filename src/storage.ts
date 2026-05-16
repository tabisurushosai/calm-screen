export type FeatureKey =
  | "blue_filter"
  | "desaturate"
  | "animation_mute"
  | "dark_force"
  | "brightness_cap";

export type Intensity = "low" | "medium" | "high";

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

export async function loadSettings(): Promise<Settings> {
  const raw = (await chrome.storage.local.get([
    "enabled",
    "features",
    "intensity",
    "premium_unlocked",
    "trial_start_ts",
    "schema_version",
  ])) as Partial<Record<keyof Settings, unknown>>;

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

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export async function setMasterEnabled(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ enabled });
}

export async function setFeature(key: FeatureKey, value: boolean): Promise<void> {
  const current = (await chrome.storage.local.get("features")) as {
    features?: Record<FeatureKey, boolean>;
  };
  const next = { ...coerceFeatures(current.features), [key]: value };
  await chrome.storage.local.set({ features: next });
}

export async function setIntensity(intensity: Intensity): Promise<void> {
  await chrome.storage.local.set({ intensity });
}

export async function startTrial(now: number = Date.now()): Promise<void> {
  await chrome.storage.local.set({ trial_start_ts: now });
}

export async function setPremiumUnlocked(unlocked: boolean): Promise<void> {
  await chrome.storage.local.set({ premium_unlocked: unlocked });
}

export async function resetToDefaults(): Promise<void> {
  await chrome.storage.local.set({
    enabled: DEFAULTS.enabled,
    features: DEFAULTS.features,
    intensity: DEFAULTS.intensity,
  });
}

export function trialDaysRemaining(
  trialStartTs: number | null,
  now: number = Date.now(),
): number {
  if (!trialStartTs) return 0;
  const elapsed = now - trialStartTs;
  const remaining = Math.ceil((TRIAL_DURATION_MS - elapsed) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

export function isPremiumActive(
  settings: Pick<Settings, "premium_unlocked" | "trial_start_ts">,
  now: number = Date.now(),
): boolean {
  if (settings.premium_unlocked) return true;
  return trialDaysRemaining(settings.trial_start_ts, now) > 0;
}

export type SettingsChangeHandler = (
  next: Settings,
  changes: { [K in keyof Settings]?: { oldValue?: Settings[K]; newValue?: Settings[K] } },
) => void;

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

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
