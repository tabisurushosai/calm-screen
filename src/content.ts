import { loadSettings, onSettingsChanged, type Settings } from "./storage";
import { apply as applyBlueFilter, paramsFor, remove as removeBlueFilter } from "./features/blue-filter";

let rafHandle: number | null = null;
let pendingSettings: Settings | null = null;

function reconcile(settings: Settings): void {
  const doc = document;
  const shouldApplyBlueFilter = settings.enabled && settings.features.blue_filter;

  if (shouldApplyBlueFilter) {
    applyBlueFilter(doc, paramsFor(settings.intensity));
  } else {
    removeBlueFilter(doc);
  }
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
