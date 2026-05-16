import { describe, it, expect } from "vitest";
import { composeFilterValue } from "./compose";
import * as blueFilter from "./blue-filter";
import * as desaturate from "./desaturate";
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
});
