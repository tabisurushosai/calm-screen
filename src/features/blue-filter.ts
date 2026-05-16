import type { Intensity } from "../storage";

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

export function paramsFor(intensity: Intensity): BlueFilterParams {
  return PARAMS[intensity];
}

export function toFilterValue(p: BlueFilterParams): string {
  return `sepia(${p.sepia}) hue-rotate(${p.hueRotate}deg) saturate(${p.saturate})`;
}

export function toCss(p: BlueFilterParams): string {
  return `html{filter:${toFilterValue(p)} !important;}`;
}

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

export function remove(doc: Document): void {
  const style = doc.getElementById(STYLE_ELEMENT_ID);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
  doc.documentElement.style.removeProperty("filter");
}
