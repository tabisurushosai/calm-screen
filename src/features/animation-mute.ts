import type { Intensity } from "../storage";

export interface AnimationMuteParams {
  duration: string;
  killAutoplay: boolean;
}

export const STYLE_ELEMENT_ID = "calm-screen-animation-mute";

const PARAMS: Record<Intensity, AnimationMuteParams> = {
  low: { duration: "200ms", killAutoplay: false },
  medium: { duration: "1ms", killAutoplay: false },
  high: { duration: "1ms", killAutoplay: true },
};

export function paramsFor(intensity: Intensity): AnimationMuteParams {
  return PARAMS[intensity];
}

export function toCss(p: AnimationMuteParams): string {
  const base =
    `*,*::before,*::after{` +
    `animation-duration:${p.duration} !important;` +
    `animation-delay:0s !important;` +
    `animation-iteration-count:1 !important;` +
    `transition-duration:${p.duration} !important;` +
    `transition-delay:0s !important;` +
    `}` +
    `html{scroll-behavior:auto !important;}`;
  if (!p.killAutoplay) return base;
  return (
    base +
    `*,*::before,*::after{will-change:auto !important;}`
  );
}

let observer: MutationObserver | null = null;
const handled: WeakSet<HTMLMediaElement> = new WeakSet();

function pauseAutoplayMedia(root: ParentNode): void {
  const nodes = root.querySelectorAll<HTMLMediaElement>(
    "video[autoplay],audio[autoplay]",
  );
  for (const el of Array.from(nodes)) {
    if (handled.has(el)) continue;
    handled.add(el);
    try {
      el.pause();
    } catch {
      // best-effort
    }
  }
}

function startAutoplayObserver(doc: Document): void {
  if (observer) return;
  pauseAutoplayMedia(doc);
  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (node.nodeType !== 1) continue;
        const el = node as Element;
        if (el.matches?.("video[autoplay],audio[autoplay]")) {
          pauseAutoplayMedia(el.parentNode ?? doc);
        } else {
          pauseAutoplayMedia(el);
        }
      }
    }
  });
  const target = doc.documentElement ?? doc;
  observer.observe(target, { childList: true, subtree: true });
}

function stopAutoplayObserver(): void {
  if (!observer) return;
  observer.disconnect();
  observer = null;
}

export function apply(doc: Document, p: AnimationMuteParams): void {
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

  if (p.killAutoplay) {
    startAutoplayObserver(doc);
  } else {
    stopAutoplayObserver();
  }
}

export function remove(doc: Document): void {
  const style = doc.getElementById(STYLE_ELEMENT_ID);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
  stopAutoplayObserver();
}
