import { loadSettings, onSettingsChanged, type Settings } from "./storage";
import { composeFilterValue } from "./features/compose";
import * as animationMute from "./features/animation-mute";
import * as darkForce from "./features/dark-force";

const COMPOSED_STYLE_ID = "calm-screen-filter";

let rafHandle: number | null = null;
let pendingSettings: Settings | null = null;

function applyComposedFilter(doc: Document, value: string): void {
  const root = doc.documentElement;
  let style = doc.getElementById(COMPOSED_STYLE_ID) as HTMLStyleElement | null;

  if (!value) {
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
    }
    root.style.removeProperty("filter");
    return;
  }

  const css = `html{filter:${value} !important;}`;
  if (!style) {
    style = doc.createElement("style");
    style.id = COMPOSED_STYLE_ID;
    const head = doc.head ?? root;
    head.appendChild(style);
  }
  if (style.textContent !== css) {
    style.textContent = css;
  }

  // CSP fallback: setting the property directly bypasses style-src restrictions.
  root.style.setProperty("filter", value, "important");
}

function reconcileAnimationMute(settings: Settings): void {
  if (settings.enabled && settings.features.animation_mute) {
    animationMute.apply(document, animationMute.paramsFor(settings.intensity));
  } else {
    animationMute.remove(document);
  }
}

function reconcileDarkForce(settings: Settings): void {
  if (settings.enabled && settings.features.dark_force) {
    darkForce.apply(document, darkForce.paramsFor(settings.intensity));
  } else {
    darkForce.remove(document);
  }
}

function reconcile(settings: Settings): void {
  applyComposedFilter(document, composeFilterValue(settings));
  reconcileAnimationMute(settings);
  reconcileDarkForce(settings);
}

function schedule(settings: Settings): void {
  pendingSettings = settings;
  if (rafHandle !== null) return;

  const flush = (): void => {
    rafHandle = null;
    const next = pendingSettings;
    pendingSettings = null;
    if (next) reconcile(next);
  };

  if (typeof requestAnimationFrame === "function") {
    rafHandle = requestAnimationFrame(flush);
  } else {
    rafHandle = setTimeout(flush, 0) as unknown as number;
  }
}

async function init(): Promise<void> {
  try {
    const settings = await loadSettings();
    schedule(settings);
  } catch (err) {
    console.error("[calm-screen] content init failed", err);
  }

  onSettingsChanged((next) => {
    schedule(next);
  });
}

void init();
