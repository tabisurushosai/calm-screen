import { applyI18n, t } from "./i18n";

type FeatureKey =
  | "blue_filter"
  | "desaturate"
  | "animation_mute"
  | "dark_force"
  | "brightness_cap";

interface StoredSettings {
  enabled: boolean;
  features: Record<FeatureKey, boolean>;
  premium_unlocked: boolean;
  trial_start_ts: number | null;
}

const PREMIUM_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "brightness_cap",
]);

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const FEATURE_KEY_MAP: Record<string, FeatureKey> = {
  "blue-filter": "blue_filter",
  desaturate: "desaturate",
  "animation-mute": "animation_mute",
  "dark-force": "dark_force",
  "brightness-cap": "brightness_cap",
};

function toFeatureKey(domKey: string): FeatureKey | null {
  return FEATURE_KEY_MAP[domKey] ?? null;
}

async function loadSettings(): Promise<StoredSettings> {
  const raw = (await chrome.storage.local.get([
    "enabled",
    "features",
    "premium_unlocked",
    "trial_start_ts",
  ])) as Partial<StoredSettings>;

  return {
    enabled: raw.enabled ?? true,
    features: {
      blue_filter: raw.features?.blue_filter ?? true,
      desaturate: raw.features?.desaturate ?? true,
      animation_mute: raw.features?.animation_mute ?? true,
      dark_force: raw.features?.dark_force ?? false,
      brightness_cap: raw.features?.brightness_cap ?? false,
    },
    premium_unlocked: raw.premium_unlocked ?? false,
    trial_start_ts: raw.trial_start_ts ?? null,
  };
}

function trialDaysRemaining(trialStartTs: number | null): number {
  if (!trialStartTs) return 0;
  const elapsed = Date.now() - trialStartTs;
  const remaining = Math.ceil((TRIAL_DURATION_MS - elapsed) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

function isPremiumActive(settings: StoredSettings): boolean {
  if (settings.premium_unlocked) return true;
  return trialDaysRemaining(settings.trial_start_ts) > 0;
}

function renderTrialBanner(settings: StoredSettings): void {
  const banner = document.getElementById("trial-banner") as HTMLElement | null;
  const text = document.getElementById("trial-text");
  if (!banner || !text) return;

  if (settings.premium_unlocked) {
    text.textContent = t("premium_unlocked");
    banner.hidden = false;
    return;
  }

  const days = trialDaysRemaining(settings.trial_start_ts);
  if (settings.trial_start_ts && days > 0) {
    text.textContent = t("popup_trial_remaining", String(days));
    banner.hidden = false;
    return;
  }

  banner.hidden = true;
}

function applyMasterEnabledState(enabled: boolean): void {
  document.body.classList.toggle("popup--disabled", !enabled);
}

function applyPremiumLockState(features: NodeListOf<HTMLLabelElement>, premiumActive: boolean): void {
  features.forEach((label) => {
    const domKey = label.dataset.feature;
    if (!domKey) return;
    const key = toFeatureKey(domKey);
    if (!key) return;
    if (!PREMIUM_FEATURES.has(key)) return;

    const input = label.querySelector<HTMLInputElement>(".feature__toggle");
    if (!input) return;

    if (!premiumActive) {
      input.disabled = true;
      input.checked = false;
      label.classList.add("feature--locked");
      label.title = t("premium_feature_locked");
    } else {
      input.disabled = false;
      label.classList.remove("feature--locked");
      label.removeAttribute("title");
    }
  });
}

function hydrateUi(settings: StoredSettings): void {
  const master = document.getElementById("master-toggle") as HTMLInputElement | null;
  if (master) {
    master.checked = settings.enabled;
  }
  applyMasterEnabledState(settings.enabled);

  const featureLabels = document.querySelectorAll<HTMLLabelElement>(".feature");
  featureLabels.forEach((label) => {
    const domKey = label.dataset.feature;
    if (!domKey) return;
    const key = toFeatureKey(domKey);
    if (!key) return;
    const input = label.querySelector<HTMLInputElement>(".feature__toggle");
    if (!input) return;
    input.checked = settings.features[key];
  });

  applyPremiumLockState(featureLabels, isPremiumActive(settings));
  renderTrialBanner(settings);
}

function wireEvents(): void {
  const master = document.getElementById("master-toggle") as HTMLInputElement | null;
  master?.addEventListener("change", () => {
    const enabled = master.checked;
    applyMasterEnabledState(enabled);
    chrome.storage.local.set({ enabled }).catch((err) => {
      console.error("[calm-screen] failed to persist enabled", err);
    });
  });

  document.querySelectorAll<HTMLInputElement>(".feature__toggle").forEach((input) => {
    input.addEventListener("change", async () => {
      const domKey = input.dataset.featureKey;
      if (!domKey) return;
      const key = toFeatureKey(domKey);
      if (!key) return;

      const current = (await chrome.storage.local.get("features")) as {
        features?: Record<FeatureKey, boolean>;
      };
      const next = { ...(current.features ?? {}), [key]: input.checked };
      await chrome.storage.local.set({ features: next });
    });
  });

  const openOptions = document.getElementById("open-options");
  openOptions?.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL("options.html"));
    }
  });
}

async function init(): Promise<void> {
  applyI18n();
  const settings = await loadSettings();
  hydrateUi(settings);
  wireEvents();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => console.error("[calm-screen] popup init failed", err));
  });
} else {
  init().catch((err) => console.error("[calm-screen] popup init failed", err));
}
