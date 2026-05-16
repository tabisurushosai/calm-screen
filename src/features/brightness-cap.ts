import type { Intensity } from "../storage";

export interface BrightnessCapParams {
  brightness: number;
}

export const STYLE_ELEMENT_ID = "calm-screen-brightness-cap";

const PARAMS: Record<Intensity, BrightnessCapParams> = {
  low: { brightness: 0.9 },
  medium: { brightness: 0.75 },
  high: { brightness: 0.6 },
};

export function paramsFor(intensity: Intensity): BrightnessCapParams {
  return PARAMS[intensity];
}

export function toFilterValue(p: BrightnessCapParams): string {
  return `brightness(${p.brightness})`;
}

export function toCss(p: BrightnessCapParams): string {
  return `html{filter:${toFilterValue(p)} !important;}`;
}

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

export function remove(doc: Document): void {
  const style = doc.getElementById(STYLE_ELEMENT_ID);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
  doc.documentElement.style.removeProperty("filter");
}
