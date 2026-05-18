/** @fileoverview Unit tests for `desaturate.ts` — intensity tuning, CSS
 *  emission, and idempotent apply/remove against a jsdom Document. */
import { describe, it, expect, beforeEach } from "vitest";
import {
  STYLE_ELEMENT_ID,
  apply,
  paramsFor,
  remove,
  toCss,
  toFilterValue,
} from "./desaturate";
import { INTENSITY_VALUES, type Intensity } from "../storage";

describe("desaturate pure helpers", () => {
  it("returns the documented params for each intensity", () => {
    expect(paramsFor("low")).toEqual({ saturate: 0.8 });
    expect(paramsFor("medium")).toEqual({ saturate: 0.6 });
    expect(paramsFor("high")).toEqual({ saturate: 0.4 });
  });

  it("monotonically decreases saturate as intensity rises", () => {
    const order: Intensity[] = ["low", "medium", "high"];
    const params = order.map(paramsFor);
    for (let i = 1; i < params.length; i++) {
      expect(params[i].saturate).toBeLessThan(params[i - 1].saturate);
    }
  });

  it("never produces full monochrome (saturate >= 0.4 floor per design)", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(paramsFor(intensity).saturate).toBeGreaterThanOrEqual(0.4);
    }
  });

  it("covers every Intensity value declared in storage", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(() => paramsFor(intensity)).not.toThrow();
    }
  });

  it("formats CSS filter strings deterministically", () => {
    const p = paramsFor("medium");
    expect(toFilterValue(p)).toBe("saturate(0.6)");
    expect(toCss(p)).toBe("html{filter:saturate(0.6) !important;}");
  });
});

describe("desaturate DOM side effects", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("apply injects a single <style> with the expected id", () => {
    apply(document, paramsFor("low"));
    const styles = document.querySelectorAll(`#${STYLE_ELEMENT_ID}`);
    expect(styles.length).toBe(1);
    expect((styles[0] as HTMLStyleElement).textContent).toContain("saturate(0.8)");
  });

  it("apply is idempotent across repeat calls with the same params", () => {
    apply(document, paramsFor("medium"));
    apply(document, paramsFor("medium"));
    apply(document, paramsFor("medium"));
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`).length).toBe(1);
  });

  it("apply updates the <style> textContent when params change", () => {
    apply(document, paramsFor("low"));
    apply(document, paramsFor("high"));
    const style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain("saturate(0.4)");
    expect(style!.textContent).not.toContain("saturate(0.8)");
  });

  it("apply sets an inline filter on <html> as a CSP fallback", () => {
    apply(document, paramsFor("high"));
    const inline = document.documentElement.style.getPropertyValue("filter");
    expect(inline).toBe("saturate(0.4)");
    expect(document.documentElement.style.getPropertyPriority("filter")).toBe("important");
  });

  it("remove deletes the <style> element and clears the inline filter", () => {
    apply(document, paramsFor("medium"));
    remove(document);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
    expect(document.documentElement.style.getPropertyValue("filter")).toBe("");
  });

  it("remove is safe to call when nothing has been applied", () => {
    expect(() => remove(document)).not.toThrow();
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });
});
