import { describe, it, expect } from "vitest";
import { composeFilterValue } from "./compose";
import * as blueFilter from "./blue-filter";
import * as desaturate from "./desaturate";
import * as brightnessCap from "./brightness-cap";
import * as darkForce from "./dark-force";
import { DEFAULTS, type Settings } from "../storage";

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULTS,
    ...patch,
    features: { ...DEFAULTS.features, ...(patch.features ?? {}) },
  };
}

describe("compose filter value", () => {
  it("returns empty string when master toggle is off", () => {
    expect(composeFilterValue(settings({ enabled: false }))).toBe("");
  });

  it("returns empty string when no features are enabled", () => {
    expect(
      composeFilterValue(
        settings({
          features: {
            blue_filter: false,
            desaturate: false,
            animation_mute: false,
            dark_force: false,
            brightness_cap: false,
          },
        }),
      ),
    ).toBe("");
  });

  it("emits only blue-filter when desaturate is off", () => {
    const value = composeFilterValue(
      settings({
        intensity: "medium",
        features: { ...DEFAULTS.features, blue_filter: true, desaturate: false },
      }),
    );
    expect(value).toBe(blueFilter.toFilterValue(blueFilter.paramsFor("medium")));
  });

  it("emits only desaturate when blue-filter is off", () => {
    const value = composeFilterValue(
      settings({
        intensity: "high",
        features: { ...DEFAULTS.features, blue_filter: false, desaturate: true },
      }),
    );
    expect(value).toBe(desaturate.toFilterValue(desaturate.paramsFor("high")));
  });

  it("stacks both filters space-joined when both are enabled", () => {
    const value = composeFilterValue(
      settings({
        intensity: "medium",
        features: { ...DEFAULTS.features, blue_filter: true, desaturate: true },
      }),
    );
    const expected = [
      blueFilter.toFilterValue(blueFilter.paramsFor("medium")),
      desaturate.toFilterValue(desaturate.paramsFor("medium")),
    ].join(" ");
    expect(value).toBe(expected);
  });

  it("preserves blue-filter-before-desaturate ordering (deterministic)", () => {
    const value = composeFilterValue(
      settings({
        intensity: "low",
        features: { ...DEFAULTS.features, blue_filter: true, desaturate: true },
      }),
    );
    expect(value.indexOf("sepia(")).toBeLessThan(value.indexOf("saturate("));
  });

  it("responds to intensity changes (high produces stronger sepia + lower saturate than low)", () => {
    const lo = composeFilterValue(
      settings({
        intensity: "low",
        features: { ...DEFAULTS.features, blue_filter: true, desaturate: true },
      }),
    );
    const hi = composeFilterValue(
      settings({
        intensity: "high",
        features: { ...DEFAULTS.features, blue_filter: true, desaturate: true },
      }),
    );
    expect(hi).toContain("sepia(0.5)");
    expect(hi).toContain("saturate(0.4)");
    expect(lo).toContain("sepia(0.15)");
    expect(lo).toContain("saturate(0.8)");
  });

  it("omits dark-force from compose at low intensity (invert=false → toFilterValue=='')", () => {
    const value = composeFilterValue(
      settings({
        intensity: "low",
        features: { ...DEFAULTS.features, blue_filter: false, desaturate: false, dark_force: true },
      }),
    );
    expect(value).toBe("");
  });

  it("emits ONLY the invert filter when dark-force is the sole enabled feature at medium", () => {
    const value = composeFilterValue(
      settings({
        intensity: "medium",
        features: { ...DEFAULTS.features, blue_filter: false, desaturate: false, dark_force: true },
      }),
    );
    expect(value).toBe(darkForce.INVERT_FILTER);
  });

  it("emits ONLY the invert filter when dark-force is the sole enabled feature at high", () => {
    const value = composeFilterValue(
      settings({
        intensity: "high",
        features: { ...DEFAULTS.features, blue_filter: false, desaturate: false, dark_force: true },
      }),
    );
    expect(value).toBe(darkForce.INVERT_FILTER);
  });

  it("places dark-force invert AFTER blue-filter and desaturate (ordering invariant)", () => {
    const value = composeFilterValue(
      settings({
        intensity: "high",
        features: {
          ...DEFAULTS.features,
          blue_filter: true,
          desaturate: true,
          dark_force: true,
        },
      }),
    );
    const sepiaIdx = value.indexOf("sepia(");
    const saturateIdx = value.indexOf("saturate(");
    const invertIdx = value.indexOf("invert(");
    expect(sepiaIdx).toBeGreaterThanOrEqual(0);
    expect(saturateIdx).toBeGreaterThanOrEqual(0);
    expect(invertIdx).toBeGreaterThanOrEqual(0);
    expect(sepiaIdx).toBeLessThan(saturateIdx);
    expect(saturateIdx).toBeLessThan(invertIdx);
  });

  it("stacks blue-filter + dark-force(medium) space-joined in order blue-filter → dark-force", () => {
    const value = composeFilterValue(
      settings({
        intensity: "medium",
        features: {
          ...DEFAULTS.features,
          blue_filter: true,
          desaturate: false,
          dark_force: true,
        },
      }),
    );
    const expected = [
      blueFilter.toFilterValue(blueFilter.paramsFor("medium")),
      darkForce.INVERT_FILTER,
    ].join(" ");
    expect(value).toBe(expected);
  });

  it("omits brightness-cap when features.brightness_cap is false (default)", () => {
    const value = composeFilterValue(
      settings({
        intensity: "high",
        features: { ...DEFAULTS.features, blue_filter: false, desaturate: false },
      }),
    );
    expect(value).not.toContain("brightness(");
  });

  it("emits ONLY brightness-cap when it is the sole enabled feature", () => {
    for (const intensity of ["low", "medium", "high"] as const) {
      const value = composeFilterValue(
        settings({
          intensity,
          features: {
            blue_filter: false,
            desaturate: false,
            animation_mute: false,
            dark_force: false,
            brightness_cap: true,
          },
        }),
      );
      expect(value).toBe(brightnessCap.toFilterValue(brightnessCap.paramsFor(intensity)));
    }
  });

  it("stacks blue-filter + brightness-cap space-joined in order blue-filter → brightness-cap", () => {
    const value = composeFilterValue(
      settings({
        intensity: "medium",
        features: {
          ...DEFAULTS.features,
          blue_filter: true,
          desaturate: false,
          brightness_cap: true,
        },
      }),
    );
    const expected = [
      blueFilter.toFilterValue(blueFilter.paramsFor("medium")),
      brightnessCap.toFilterValue(brightnessCap.paramsFor("medium")),
    ].join(" ");
    expect(value).toBe(expected);
  });

  it("places brightness-cap AFTER desaturate (deterministic ordering)", () => {
    const value = composeFilterValue(
      settings({
        intensity: "medium",
        features: {
          ...DEFAULTS.features,
          blue_filter: false,
          desaturate: true,
          brightness_cap: true,
        },
      }),
    );
    expect(value.indexOf("saturate(")).toBeLessThan(value.indexOf("brightness("));
  });

  it("places brightness-cap BEFORE dark-force(medium) invert (so brightness applies in pre-invert color space)", () => {
    const value = composeFilterValue(
      settings({
        intensity: "medium",
        features: {
          ...DEFAULTS.features,
          blue_filter: false,
          desaturate: false,
          brightness_cap: true,
          dark_force: true,
        },
      }),
    );
    const brightnessIdx = value.indexOf("brightness(");
    const invertIdx = value.indexOf("invert(");
    expect(brightnessIdx).toBeGreaterThanOrEqual(0);
    expect(invertIdx).toBeGreaterThanOrEqual(0);
    expect(brightnessIdx).toBeLessThan(invertIdx);
  });

  it("full stack emits blue-filter → desaturate → brightness-cap → dark-force(invert) in this exact order", () => {
    const value = composeFilterValue(
      settings({
        intensity: "high",
        features: {
          ...DEFAULTS.features,
          blue_filter: true,
          desaturate: true,
          brightness_cap: true,
          dark_force: true,
        },
      }),
    );
    const sepiaIdx = value.indexOf("sepia(");
    const saturateIdx = value.indexOf("saturate(");
    const brightnessIdx = value.indexOf("brightness(");
    const invertIdx = value.indexOf("invert(");
    expect(sepiaIdx).toBeGreaterThanOrEqual(0);
    expect(saturateIdx).toBeGreaterThanOrEqual(0);
    expect(brightnessIdx).toBeGreaterThanOrEqual(0);
    expect(invertIdx).toBeGreaterThanOrEqual(0);
    expect(sepiaIdx).toBeLessThan(saturateIdx);
    expect(saturateIdx).toBeLessThan(brightnessIdx);
    expect(brightnessIdx).toBeLessThan(invertIdx);
  });

  it("brightness-cap contributes even at low intensity (unlike dark-force which omits at low)", () => {
    const value = composeFilterValue(
      settings({
        intensity: "low",
        features: {
          blue_filter: false,
          desaturate: false,
          animation_mute: false,
          dark_force: true,
          brightness_cap: true,
        },
      }),
    );
    expect(value).toBe(brightnessCap.toFilterValue(brightnessCap.paramsFor("low")));
    expect(value).not.toContain("invert(");
  });

  it("respects master toggle: enabled=false returns empty even when brightness_cap=true", () => {
    expect(
      composeFilterValue(
        settings({
          enabled: false,
          features: { ...DEFAULTS.features, brightness_cap: true },
        }),
      ),
    ).toBe("");
  });
});
