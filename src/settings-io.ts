/**
 * @fileoverview Export/import user settings as JSON. Premium-related fields
 * (`premium_unlocked`, `trial_start_ts`) are intentionally excluded from both
 * directions — exporting protects sensitive entitlement state and importing
 * prevents users from granting themselves premium by hand-editing a file.
 */

import {
  DEFAULTS,
  FEATURE_KEYS,
  INTENSITY_VALUES,
  SCHEMA_VERSION,
  type FeatureKey,
  type Intensity,
  type Settings,
} from "./storage";

/** Tag embedded in exported files so we can sanity-check imports. */
export const EXPORT_FORMAT = "calm-screen-settings";

/** Shape of a JSON file produced by {@link serializeSettings}. */
export interface SettingsExport {
  format: typeof EXPORT_FORMAT;
  schema_version: number;
  exported_at: number;
  settings: {
    enabled: boolean;
    features: Record<FeatureKey, boolean>;
    intensity: Intensity;
  };
}

/**
 * Build the JSON payload to download. Premium fields are stripped so the file
 * is safe to share and cannot be used to forge entitlement on import.
 */
export function serializeSettings(
  settings: Settings,
  now: number = Date.now(),
): SettingsExport {
  return {
    format: EXPORT_FORMAT,
    schema_version: settings.schema_version || SCHEMA_VERSION,
    exported_at: now,
    settings: {
      enabled: settings.enabled,
      features: { ...settings.features },
      intensity: settings.intensity,
    },
  };
}

/** Parse + validate a JSON string. Returns null on any structural problem. */
export function parseSettingsImport(
  raw: string,
): Pick<Settings, "enabled" | "features" | "intensity"> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const obj = parsed as Record<string, unknown>;
  if (obj.format !== EXPORT_FORMAT) return null;

  const src = obj.settings;
  if (!src || typeof src !== "object") return null;
  const s = src as Record<string, unknown>;

  if (typeof s.enabled !== "boolean") return null;

  if (
    typeof s.intensity !== "string" ||
    !(INTENSITY_VALUES as readonly string[]).includes(s.intensity)
  ) {
    return null;
  }

  if (!s.features || typeof s.features !== "object") return null;
  const rawFeatures = s.features as Record<string, unknown>;
  const features = {} as Record<FeatureKey, boolean>;
  for (const key of FEATURE_KEYS) {
    const v = rawFeatures[key];
    features[key] = typeof v === "boolean" ? v : DEFAULTS.features[key];
  }

  return {
    enabled: s.enabled,
    features,
    intensity: s.intensity as Intensity,
  };
}

/**
 * Suggested filename for the export, e.g. `calm-screen-settings-2026-05-18.json`.
 * Timestamp uses local date so users recognise it; collisions are tolerated.
 */
export function exportFilename(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `calm-screen-settings-${y}-${m}-${d}.json`;
}
