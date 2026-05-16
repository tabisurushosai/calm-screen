import type { Intensity } from "../storage";

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

export function paramsFor(intensity: Intensity): DarkForceParams {
  return PARAMS[intensity];
}

export function toFilterValue(p: DarkForceParams): string {
  return p.invert ? INVERT_FILTER : "";
}

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

export function remove(doc: Document): void {
  const style = doc.getElementById(STYLE_ELEMENT_ID);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
}
