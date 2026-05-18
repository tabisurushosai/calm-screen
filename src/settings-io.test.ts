/** @fileoverview Tests for settings export/import — round-trip fidelity for
 *  user-facing fields, premium fields stripped, and rejection of malformed,
 *  foreign, or tampered JSON payloads. */
import { describe, it, expect } from "vitest";
import {
  EXPORT_FORMAT,
  exportFilename,
  parseSettingsImport,
  serializeSettings,
} from "./settings-io";
import { DEFAULTS, SCHEMA_VERSION, type Settings } from "./storage";

const NOW = 1_700_000_000_000;

function settings(over: Partial<Settings> = {}): Settings {
  return { ...DEFAULTS, ...over };
}

describe("serializeSettings", () => {
  it("emits the format tag, schema version, and timestamp", () => {
    const out = serializeSettings(settings(), NOW);
    expect(out.format).toBe(EXPORT_FORMAT);
    expect(out.schema_version).toBe(SCHEMA_VERSION);
    expect(out.exported_at).toBe(NOW);
  });

  it("includes enabled/features/intensity verbatim", () => {
    const out = serializeSettings(
      settings({
        enabled: false,
        intensity: "high",
        features: {
          blue_filter: false,
          desaturate: true,
          animation_mute: false,
          dark_force: true,
          brightness_cap: true,
        },
      }),
      NOW,
    );
    expect(out.settings.enabled).toBe(false);
    expect(out.settings.intensity).toBe("high");
    expect(out.settings.features.dark_force).toBe(true);
    expect(out.settings.features.brightness_cap).toBe(true);
  });

  it("does NOT include premium_unlocked or trial_start_ts", () => {
    const out = serializeSettings(
      settings({ premium_unlocked: true, trial_start_ts: NOW - 1000 }),
      NOW,
    );
    expect(out.settings).not.toHaveProperty("premium_unlocked");
    expect(out.settings).not.toHaveProperty("trial_start_ts");
  });

  it("clones the features map so callers cannot mutate the source", () => {
    const src = settings();
    const out = serializeSettings(src, NOW);
    out.settings.features.blue_filter = !out.settings.features.blue_filter;
    expect(src.features.blue_filter).toBe(DEFAULTS.features.blue_filter);
  });
});

describe("parseSettingsImport — happy path", () => {
  it("round-trips a serialized export back to the same user-facing values", () => {
    const src = settings({
      enabled: false,
      intensity: "low",
      features: {
        blue_filter: false,
        desaturate: false,
        animation_mute: true,
        dark_force: true,
        brightness_cap: false,
      },
    });
    const json = JSON.stringify(serializeSettings(src, NOW));
    const parsed = parseSettingsImport(json);
    expect(parsed).not.toBeNull();
    expect(parsed!.enabled).toBe(false);
    expect(parsed!.intensity).toBe("low");
    expect(parsed!.features).toEqual(src.features);
  });

  it("fills missing feature keys from DEFAULTS rather than rejecting", () => {
    const payload = {
      format: EXPORT_FORMAT,
      schema_version: SCHEMA_VERSION,
      exported_at: NOW,
      settings: {
        enabled: true,
        intensity: "medium",
        features: { blue_filter: false },
      },
    };
    const parsed = parseSettingsImport(JSON.stringify(payload));
    expect(parsed).not.toBeNull();
    expect(parsed!.features.blue_filter).toBe(false);
    expect(parsed!.features.desaturate).toBe(DEFAULTS.features.desaturate);
    expect(parsed!.features.brightness_cap).toBe(DEFAULTS.features.brightness_cap);
  });

  it("ignores premium fields if a tampered file includes them", () => {
    const tampered = {
      format: EXPORT_FORMAT,
      schema_version: SCHEMA_VERSION,
      exported_at: NOW,
      settings: {
        enabled: true,
        intensity: "medium",
        features: DEFAULTS.features,
        premium_unlocked: true,
        trial_start_ts: NOW,
      },
    };
    const parsed = parseSettingsImport(JSON.stringify(tampered));
    expect(parsed).not.toBeNull();
    expect(parsed as unknown as Record<string, unknown>).not.toHaveProperty(
      "premium_unlocked",
    );
    expect(parsed as unknown as Record<string, unknown>).not.toHaveProperty(
      "trial_start_ts",
    );
  });
});

describe("parseSettingsImport — rejection", () => {
  it("returns null for non-JSON input", () => {
    expect(parseSettingsImport("not json")).toBeNull();
    expect(parseSettingsImport("")).toBeNull();
  });

  it("returns null when the format tag is missing or wrong", () => {
    expect(
      parseSettingsImport(
        JSON.stringify({ settings: { enabled: true, intensity: "medium", features: {} } }),
      ),
    ).toBeNull();
    expect(
      parseSettingsImport(
        JSON.stringify({
          format: "other-extension",
          settings: { enabled: true, intensity: "medium", features: {} },
        }),
      ),
    ).toBeNull();
  });

  it("returns null when intensity is not one of low/medium/high", () => {
    const bad = {
      format: EXPORT_FORMAT,
      schema_version: 1,
      exported_at: NOW,
      settings: { enabled: true, intensity: "extreme", features: {} },
    };
    expect(parseSettingsImport(JSON.stringify(bad))).toBeNull();
  });

  it("returns null when enabled is missing or wrong type", () => {
    const bad = {
      format: EXPORT_FORMAT,
      schema_version: 1,
      exported_at: NOW,
      settings: { intensity: "medium", features: {} },
    };
    expect(parseSettingsImport(JSON.stringify(bad))).toBeNull();
  });

  it("returns null when settings is missing entirely", () => {
    const bad = { format: EXPORT_FORMAT, schema_version: 1, exported_at: NOW };
    expect(parseSettingsImport(JSON.stringify(bad))).toBeNull();
  });
});

describe("exportFilename", () => {
  it("formats date as YYYY-MM-DD with zero padding", () => {
    const d = new Date(2026, 0, 3); // 2026-01-03 local
    expect(exportFilename(d)).toBe("calm-screen-settings-2026-01-03.json");
  });
});
