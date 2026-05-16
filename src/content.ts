import { loadSettings, onSettingsChanged, type Settings } from "./storage";
import * as blueFilter from "./features/blue-filter";
import * as desaturate from "./features/desaturate";

const COMPOSED_STYLE_ID = "calm-screen-filter";

let rafHandle: number | null = null;
let pendingSettings: Settings | null = null;

function composeFilterValue(settings: Settings): string {
  if (!settings.enabled) return "";
  const parts: string[] = [];
  if (settings.features.blue_filter) {
    parts.push(blueFilter.toFilterValue(blueFilter.paramsFor(settings.intensity)));
  }
  if (settings.features.desaturate) {
    parts.push(desaturate.toFilterValue(desaturate.paramsFor(settings.intensity)));
  }
  return parts.join(" ");
}

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

function reconcile(settings: Settings): void {
  applyComposedFilter(document, composeFilterValue(settings));
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
