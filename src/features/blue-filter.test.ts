import { describe, it, expect, beforeEach } from "vitest";
import {
  STYLE_ELEMENT_ID,
  apply,
  paramsFor,
  remove,
  toCss,
  toFilterValue,
} from "./blue-filter";
import { INTENSITY_VALUES, type Intensity } from "../storage";

describe("blue-filter pure helpers", () => {
  it("returns the documented params for each intensity", () => {
    expect(paramsFor("low")).toEqual({ sepia: 0.15, hueRotate: -10, saturate: 0.95 });
    expect(paramsFor("medium")).toEqual({ sepia: 0.3, hueRotate: -15, saturate: 0.9 });
    expect(paramsFor("high")).toEqual({ sepia: 0.5, hueRotate: -25, saturate: 0.85 });
  });

  it("monotonically increases sepia / |hue-rotate| and decreases saturate with intensity", () => {
    const order: Intensity[] = ["low", "medium", "high"];
    const params = order.map(paramsFor);
    for (let i = 1; i < params.length; i++) {
      expect(params[i].sepia).toBeGreaterThan(params[i - 1].sepia);
      expect(Math.abs(params[i].hueRotate)).toBeGreaterThan(Math.abs(params[i - 1].hueRotate));
      expect(params[i].saturate).toBeLessThan(params[i - 1].saturate);
    }
  });

  it("covers every Intensity value declared in storage", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(() => paramsFor(intensity)).not.toThrow();
    }
  });

  it("formats CSS filter strings deterministically", () => {
    const p = paramsFor("medium");
    expect(toFilterValue(p)).toBe("sepia(0.3) hue-rotate(-15deg) saturate(0.9)");
    expect(toCss(p)).toBe(
      "html{filter:sepia(0.3) hue-rotate(-15deg) saturate(0.9) !important;}",
    );
  });
});

describe("blue-filter DOM side effects", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  it("apply injects a single <style> with the expected id", () => {
    apply(document, paramsFor("low"));
    const styles = document.querySelectorAll(`#${STYLE_ELEMENT_ID}`);
    expect(styles.length).toBe(1);
    expect((styles[0] as HTMLStyleElement).textContent).toContain("sepia(0.15)");
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
    expect(style!.textContent).toContain("sepia(0.5)");
    expect(style!.textContent).not.toContain("sepia(0.15)");
  });

  it("apply sets an inline filter on <html> as a CSP fallback", () => {
    apply(document, paramsFor("high"));
    const inline = document.documentElement.style.getPropertyValue("filter");
    expect(inline).toBe("sepia(0.5) hue-rotate(-25deg) saturate(0.85)");
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
