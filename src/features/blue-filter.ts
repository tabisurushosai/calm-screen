/**
 * @fileoverview Blue-light reduction via CSS `sepia` + `hue-rotate` + `saturate`.
 * Each intensity tier maps to a `BlueFilterParams` record; `compose.ts`
 * combines this filter with the other active filters into a single
 * `html { filter: ... }` declaration applied by the content script.
 */

import type { Intensity } from "../storage";

/** Tuning parameters for the blue-filter CSS effect. */
export interface BlueFilterParams {
  sepia: number;
  hueRotate: number;
  saturate: number;
}

export const STYLE_ELEMENT_ID = "calm-screen-blue-filter";

const PARAMS: Record<Intensity, BlueFilterParams> = {
  low: { sepia: 0.15, hueRotate: -10, saturate: 0.95 },
  medium: { sepia: 0.3, hueRotate: -15, saturate: 0.9 },
  high: { sepia: 0.5, hueRotate: -25, saturate: 0.85 },
};

/** Map an intensity tier to its tuned blue-filter parameters. */
export function paramsFor(intensity: Intensity): BlueFilterParams {
  return PARAMS[intensity];
}

/** Build the CSS `filter` value used both standalone and when composed. */
export function toFilterValue(p: BlueFilterParams): string {
  return `sepia(${p.sepia}) hue-rotate(${p.hueRotate}deg) saturate(${p.saturate})`;
}

/** Build the full CSS rule (with `!important`) applied to `<html>`. */
export function toCss(p: BlueFilterParams): string {
  return `html{filter:${toFilterValue(p)} !important;}`;
}

/**
 * Apply the blue-filter style standalone. Used by isolation tests; the live
 * extension applies the composed filter from `content.ts` instead. Writes
 * both a `<style>` tag and an inline `style="filter:..."` as a CSP fallback.
 */
export function apply(doc: Document, p: BlueFilterParams): void {
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

  // Fallback for strict CSP (style-src 'self'): style tag content may be ignored.
  // Setting the property directly bypasses CSP.
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
