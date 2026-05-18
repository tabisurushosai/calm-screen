/**
 * @fileoverview Force-dark feature. Inverts the page (`invert(1)
 * hue-rotate(180deg)`) and selectively un-inverts `<img>`, `<video>`, etc. so
 * photos render in their natural colors. Higher intensities also un-invert
 * inline `background-image` styles.
 */

import type { Intensity } from "../storage";

/** Tuning parameters for the force-dark effect. */
export interface DarkForceParams {
  invert: boolean;
  reverseMedia: boolean;
  reverseBgImage: boolean;
}

export const STYLE_ELEMENT_ID = "calm-screen-dark-force";

export const INVERT_FILTER = "invert(1) hue-rotate(180deg)";

const PARAMS: Record<Intensity, DarkForceParams> = {
  low: { invert: false, reverseMedia: false, reverseBgImage: false },
  medium: { invert: true, reverseMedia: true, reverseBgImage: false },
  high: { invert: true, reverseMedia: true, reverseBgImage: true },
};

/** Map an intensity tier to its tuned force-dark parameters. */
export function paramsFor(intensity: Intensity): DarkForceParams {
  return PARAMS[intensity];
}

/**
 * Filter portion that contributes to the composed `<html>` filter — empty
 * string when no inversion is desired so `compose.ts` can drop it cleanly.
 */
export function toFilterValue(p: DarkForceParams): string {
  return p.invert ? INVERT_FILTER : "";
}

/**
 * Standalone CSS rule — sets `color-scheme:dark` and (when enabled) the media
 * un-invert rule. The `<html>`-level inversion is supplied separately via the
 * composed filter to avoid duplicating it.
 */
export function toCss(p: DarkForceParams): string {
  let css = `html{color-scheme:dark !important;}`;
  if (p.reverseMedia) {
    const selectors = [
      "img",
      "video",
      "picture",
      "iframe",
      "svg",
      "canvas",
    ];
    if (p.reverseBgImage) {
      selectors.push('[style*="background-image"]');
    }
    css += `${selectors.join(",")}{filter:${INVERT_FILTER} !important;}`;
  }
  return css;
}

/** Inject or update the force-dark `<style>` tag. */
export function apply(doc: Document, p: DarkForceParams): void {
  const css = toCss(p);
  const root = doc.documentElement;
  let style = doc.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;

  if (!style) {
    style = doc.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    const head = doc.head ?? root;
    head.appendChild(style);
  }
  if (style.textContent !== css) {
    style.textContent = css;
  }
}

/** Remove the force-dark style tag. */
export function remove(doc: Document): void {
  const style = doc.getElementById(STYLE_ELEMENT_ID);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
}
