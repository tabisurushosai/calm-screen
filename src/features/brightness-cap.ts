/**
 * @fileoverview Brightness-cap feature (premium). Dims the entire page via the
 * CSS `brightness()` filter. Premium-gated by `PREMIUM_FEATURES` in
 * `storage.ts`; gating itself is enforced in `premium.ts` / `compose.ts`.
 */

import type { Intensity } from "../storage";

/** Tuning parameters for the brightness-cap effect. */
export interface BrightnessCapParams {
  brightness: number;
}

export const STYLE_ELEMENT_ID = "calm-screen-brightness-cap";

const PARAMS: Record<Intensity, BrightnessCapParams> = {
  low: { brightness: 0.9 },
  medium: { brightness: 0.75 },
  high: { brightness: 0.6 },
};

/** Map an intensity tier to its tuned brightness-cap parameters. */
export function paramsFor(intensity: Intensity): BrightnessCapParams {
  return PARAMS[intensity];
}

/** Build the CSS `filter` value used both standalone and when composed. */
export function toFilterValue(p: BrightnessCapParams): string {
  return `brightness(${p.brightness})`;
}

/** Build the full CSS rule applied to `<html>`. */
export function toCss(p: BrightnessCapParams): string {
  return `html{filter:${toFilterValue(p)} !important;}`;
}

/** Apply the brightness-cap style standalone (mirrors blue-filter's API). */
export function apply(doc: Document, p: BrightnessCapParams): void {
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

  root.style.setProperty("filter", toFilterValue(p), "important");
}

/** Tear down both the injected `<style>` tag and the inline filter property. */
export function remove(doc: Document): void {
  const style = doc.getElementById(STYLE_ELEMENT_ID);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
  doc.documentElement.style.removeProperty("filter");
}
