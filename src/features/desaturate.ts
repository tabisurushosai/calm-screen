/**
 * @fileoverview Desaturation feature. Reduces page color saturation via the
 * CSS `saturate()` filter so vivid hues feel less stimulating. Composed into
 * the single `<html>` filter by `compose.ts`.
 */

import type { Intensity } from "../storage";

/** Tuning parameters for the desaturate CSS effect. */
export interface DesaturateParams {
  saturate: number;
}

export const STYLE_ELEMENT_ID = "calm-screen-desaturate";

const PARAMS: Record<Intensity, DesaturateParams> = {
  low: { saturate: 0.8 },
  medium: { saturate: 0.6 },
  high: { saturate: 0.4 },
};

/** Map an intensity tier to its tuned desaturate parameters. */
export function paramsFor(intensity: Intensity): DesaturateParams {
  return PARAMS[intensity];
}

/** Build the CSS `filter` value (used both standalone and when composed). */
export function toFilterValue(p: DesaturateParams): string {
  return `saturate(${p.saturate})`;
}

/** Build the full CSS rule applied to `<html>`. */
export function toCss(p: DesaturateParams): string {
  return `html{filter:${toFilterValue(p)} !important;}`;
}

/** Apply the desaturate style standalone (mirrors blue-filter's API). */
export function apply(doc: Document, p: DesaturateParams): void {
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
