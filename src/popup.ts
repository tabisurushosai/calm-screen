import { applyI18n, t } from "./i18n";
import {
  loadSettings,
  setFeature,
  setMasterEnabled,
  type FeatureKey,
  type Settings,
} from "./storage";
import {
  getPremiumStatus,
  isFeaturePremium,
  isPremiumActive,
  type PremiumStatus,
} from "./premium";

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

function renderTrialBanner(status: PremiumStatus, settings: Settings): void {
  const banner = document.getElementById("trial-banner") as HTMLElement | null;
  const text = document.getElementById("trial-text");
  if (!banner || !text) return;

  if (status.tier === "paid") {
    text.textContent = t("premium_unlocked");
    banner.hidden = false;
    return;
  }

  if (status.tier === "trial") {
    text.textContent = t("popup_trial_remaining", String(status.trialDaysRemaining));
    banner.hidden = false;
    return;
  }

  if (settings.trial_start_ts && status.trialDaysRemaining === 0) {
    text.textContent = t("premium_trial_expired");
    banner.hidden = false;
    return;
  }

  banner.hidden = true;
}

function applyMasterEnabledState(enabled: boolean): void {
  document.body.classList.toggle("popup--disabled", !enabled);
}

function applyPremiumLockState(
  features: NodeListOf<HTMLLabelElement>,
  premiumActive: boolean,
): void {
  features.forEach((label) => {
    const domKey = label.dataset.feature;
    if (!domKey) return;
    const key = toFeatureKey(domKey);
    if (!key) return;
    if (!isFeaturePremium(key)) return;

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

function hydrateUi(settings: Settings): void {
  const status = getPremiumStatus(settings);

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
  renderTrialBanner(status, settings);
}

function wireEvents(): void {
  const master = document.getElementById("master-toggle") as HTMLInputElement | null;
  master?.addEventListener("change", () => {
    const enabled = master.checked;
    applyMasterEnabledState(enabled);
    setMasterEnabled(enabled).catch((err) => {
      console.error("[calm-screen] failed to persist enabled", err);
    });
  });

  document.querySelectorAll<HTMLInputElement>(".feature__toggle").forEach((input) => {
    input.addEventListener("change", async () => {
      const domKey = input.dataset.featureKey;
      if (!domKey) return;
      const key = toFeatureKey(domKey);
      if (!key) return;
      await setFeature(key, input.checked);
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
