/** @fileoverview Unit tests for `dark-force.ts` — invert filter selection,
 *  media un-inversion selectors per intensity, and CSS emission. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  INVERT_FILTER,
  STYLE_ELEMENT_ID,
  apply,
  paramsFor,
  remove,
  toCss,
  toFilterValue,
} from "./dark-force";
import { INTENSITY_VALUES, type Intensity } from "../storage";

describe("dark-force pure helpers", () => {
  it("returns the documented params for each intensity", () => {
    expect(paramsFor("low")).toEqual({
      invert: false,
      reverseMedia: false,
      reverseBgImage: false,
    });
    expect(paramsFor("medium")).toEqual({
      invert: true,
      reverseMedia: true,
      reverseBgImage: false,
    });
    expect(paramsFor("high")).toEqual({
      invert: true,
      reverseMedia: true,
      reverseBgImage: true,
    });
  });

  it("monotonically increases (or holds) invert/reverseMedia/reverseBgImage as intensity rises", () => {
    const order: Intensity[] = ["low", "medium", "high"];
    const params = order.map(paramsFor);
    for (let i = 1; i < params.length; i++) {
      expect(Number(params[i].invert)).toBeGreaterThanOrEqual(Number(params[i - 1].invert));
      expect(Number(params[i].reverseMedia)).toBeGreaterThanOrEqual(
        Number(params[i - 1].reverseMedia),
      );
      expect(Number(params[i].reverseBgImage)).toBeGreaterThanOrEqual(
        Number(params[i - 1].reverseBgImage),
      );
    }
  });

  it("never enables reverseBgImage without reverseMedia (high-only background-image reversal)", () => {
    for (const intensity of INTENSITY_VALUES) {
      const p = paramsFor(intensity);
      if (p.reverseBgImage) {
        expect(p.reverseMedia).toBe(true);
      }
    }
  });

  it("never enables reverseMedia without invert", () => {
    for (const intensity of INTENSITY_VALUES) {
      const p = paramsFor(intensity);
      if (p.reverseMedia) {
        expect(p.invert).toBe(true);
      }
    }
  });

  it("covers every Intensity value declared in storage", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(() => paramsFor(intensity)).not.toThrow();
    }
  });

  it("exposes INVERT_FILTER as 'invert(1) hue-rotate(180deg)'", () => {
    expect(INVERT_FILTER).toBe("invert(1) hue-rotate(180deg)");
  });

  it("toFilterValue returns the invert filter only when invert is true", () => {
    expect(toFilterValue(paramsFor("low"))).toBe("");
    expect(toFilterValue(paramsFor("medium"))).toBe(INVERT_FILTER);
    expect(toFilterValue(paramsFor("high"))).toBe(INVERT_FILTER);
  });

  it("toCss always forces color-scheme:dark on html (every intensity)", () => {
    for (const intensity of INTENSITY_VALUES) {
      const css = toCss(paramsFor(intensity));
      expect(css).toContain("html{color-scheme:dark !important;}");
    }
  });

  it("toCss does NOT include any media-reversal rule at low intensity", () => {
    const css = toCss(paramsFor("low"));
    expect(css).not.toContain("img");
    expect(css).not.toContain("video");
    expect(css).not.toContain("iframe");
    expect(css).not.toContain("svg");
    expect(css).not.toContain("canvas");
    expect(css).not.toContain("background-image");
    expect(css).not.toContain("filter:");
  });

  it("toCss reverses img/video/picture/iframe/svg/canvas at medium (no background-image)", () => {
    const css = toCss(paramsFor("medium"));
    for (const sel of ["img", "video", "picture", "iframe", "svg", "canvas"]) {
      expect(css).toContain(sel);
    }
    expect(css).toContain(`filter:${INVERT_FILTER} !important`);
    expect(css).not.toContain("background-image");
  });

  it("toCss also reverses [style*=background-image] only at high intensity", () => {
    const css = toCss(paramsFor("high"));
    expect(css).toContain('[style*="background-image"]');
    expect(css).toContain(`filter:${INVERT_FILTER} !important`);
  });

  it("never produces an empty CSS string for any intensity (color-scheme is always emitted)", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(toCss(paramsFor(intensity)).length).toBeGreaterThan(0);
    }
  });
});

describe("dark-force DOM side effects", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  afterEach(() => {
    remove(document);
  });

  it("apply injects a single <style> with the expected id", () => {
    apply(document, paramsFor("low"));
    const styles = document.querySelectorAll(`#${STYLE_ELEMENT_ID}`);
    expect(styles.length).toBe(1);
    expect((styles[0] as HTMLStyleElement).textContent).toContain(
      "html{color-scheme:dark !important;}",
    );
  });

  it("apply is idempotent across repeat calls with the same params", () => {
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
    expect(style!.textContent).toContain('[style*="background-image"]');
    expect(style!.textContent).toContain(`filter:${INVERT_FILTER}`);
  });

  it("apply updates the <style> textContent when intensity drops (high → low)", () => {
    apply(document, paramsFor("high"));
    apply(document, paramsFor("low"));
    const style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain("html{color-scheme:dark !important;}");
    expect(style!.textContent).not.toContain("img,video");
    expect(style!.textContent).not.toContain('[style*="background-image"]');
  });

  it("apply does NOT set inline filter on <html> (compose path owns html filter)", () => {
    apply(document, paramsFor("high"));
    expect(document.documentElement.style.getPropertyValue("filter")).toBe("");
  });

  it("remove deletes the <style> element", () => {
    apply(document, paramsFor("medium"));
    remove(document);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });

  it("remove is safe to call when nothing has been applied", () => {
    expect(() => remove(document)).not.toThrow();
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });

  it("apply at low writes ONLY the color-scheme rule (no media filter rule)", () => {
    apply(document, paramsFor("low"));
    const style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toBe("html{color-scheme:dark !important;}");
  });
});
