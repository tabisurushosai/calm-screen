/** @fileoverview Unit tests for `brightness-cap.ts` — intensity tuning, CSS
 *  emission, and idempotent apply/remove against a jsdom Document. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  STYLE_ELEMENT_ID,
  apply,
  paramsFor,
  remove,
  toCss,
  toFilterValue,
} from "./brightness-cap";
import { INTENSITY_VALUES, type Intensity } from "../storage";

describe("brightness-cap pure helpers", () => {
  it("returns the documented brightness for each intensity (0.90/0.75/0.60)", () => {
    expect(paramsFor("low")).toEqual({ brightness: 0.9 });
    expect(paramsFor("medium")).toEqual({ brightness: 0.75 });
    expect(paramsFor("high")).toEqual({ brightness: 0.6 });
  });

  it("monotonically decreases brightness as intensity rises (low > medium > high)", () => {
    const order: Intensity[] = ["low", "medium", "high"];
    const values = order.map((i) => paramsFor(i).brightness);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it("never goes below 0.60 (v1 lower bound, no full-black)", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(paramsFor(intensity).brightness).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("never exceeds 1.0 (the function only attenuates, never amplifies)", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(paramsFor(intensity).brightness).toBeLessThanOrEqual(1.0);
    }
  });

  it("covers every Intensity value declared in storage", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(() => paramsFor(intensity)).not.toThrow();
    }
  });

  it("toFilterValue returns 'brightness(<n>)' shape for every intensity", () => {
    expect(toFilterValue(paramsFor("low"))).toBe("brightness(0.9)");
    expect(toFilterValue(paramsFor("medium"))).toBe("brightness(0.75)");
    expect(toFilterValue(paramsFor("high"))).toBe("brightness(0.6)");
  });

  it("toFilterValue always matches /^brightness\\([\\d.]+\\)$/", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(toFilterValue(paramsFor(intensity))).toMatch(/^brightness\([\d.]+\)$/);
    }
  });

  it("toCss returns 'html{filter:brightness(<n>) !important;}' shape", () => {
    expect(toCss(paramsFor("low"))).toBe("html{filter:brightness(0.9) !important;}");
    expect(toCss(paramsFor("medium"))).toBe("html{filter:brightness(0.75) !important;}");
    expect(toCss(paramsFor("high"))).toBe("html{filter:brightness(0.6) !important;}");
  });

  it("toCss never produces an empty string for any intensity", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(toCss(paramsFor(intensity)).length).toBeGreaterThan(0);
    }
  });
});

describe("brightness-cap DOM side effects", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  afterEach(() => {
    remove(document);
    document.documentElement.removeAttribute("style");
  });

  it("apply injects a single <style> with the expected id", () => {
    apply(document, paramsFor("medium"));
    const styles = document.querySelectorAll(`#${STYLE_ELEMENT_ID}`);
    expect(styles.length).toBe(1);
    expect((styles[0] as HTMLStyleElement).textContent).toBe(
      "html{filter:brightness(0.75) !important;}",
    );
  });

  it("apply is idempotent across repeat calls with the same params (no duplicate <style>)", () => {
    apply(document, paramsFor("medium"));
    apply(document, paramsFor("medium"));
    apply(document, paramsFor("medium"));
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`).length).toBe(1);
  });

  it("apply updates the <style> textContent when intensity changes (low → high)", () => {
    apply(document, paramsFor("low"));
    apply(document, paramsFor("high"));
    const style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toBe("html{filter:brightness(0.6) !important;}");
  });

  it("apply updates the <style> textContent when intensity drops (high → low)", () => {
    apply(document, paramsFor("high"));
    apply(document, paramsFor("low"));
    const style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toBe("html{filter:brightness(0.9) !important;}");
  });

  it("apply sets the inline filter on <html> as the CSP fallback path", () => {
    apply(document, paramsFor("medium"));
    expect(document.documentElement.style.getPropertyValue("filter")).toBe("brightness(0.75)");
  });

  it("remove deletes the <style> element", () => {
    apply(document, paramsFor("medium"));
    remove(document);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });

  it("remove clears the inline filter on <html>", () => {
    apply(document, paramsFor("high"));
    remove(document);
    expect(document.documentElement.style.getPropertyValue("filter")).toBe("");
  });

  it("remove is safe to call when nothing has been applied", () => {
    expect(() => remove(document)).not.toThrow();
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });
});
