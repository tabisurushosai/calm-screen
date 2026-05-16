import { applyI18n, t } from "./i18n";
import {
  loadSettings,
  resetToDefaults,
  setFeature,
  setIntensity,
  type FeatureKey,
  type Intensity,
  type Settings,
} from "./storage";
import {
  getPremiumStatus,
  isFeaturePremium,
  isPremiumActive,
  shouldStartTrial,
  startTrial,
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

function applyPremiumLockState(premiumActive: boolean): void {
  document
    .querySelectorAll<HTMLLabelElement>(".feature")
    .forEach((label) => {
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

function renderPremiumSection(status: PremiumStatus, settings: Settings): void {
  const text = document.getElementById("premium-status-text");
  const trialBtn = document.getElementById(
    "trial-start-btn",
  ) as HTMLButtonElement | null;
  const upgradeBtn = document.getElementById(
    "upgrade-btn",
  ) as HTMLButtonElement | null;
  if (!text || !trialBtn || !upgradeBtn) return;

  if (status.tier === "paid") {
    text.textContent = t("premium_unlocked");
    trialBtn.hidden = true;
    upgradeBtn.hidden = true;
    return;
  }

  if (status.tier === "trial") {
    text.textContent = t("popup_trial_remaining", String(status.trialDaysRemaining));
    trialBtn.hidden = true;
    upgradeBtn.hidden = false;
    return;
  }

  if (settings.trial_start_ts && status.trialDaysRemaining === 0) {
    text.textContent = t("premium_trial_expired");
    trialBtn.hidden = true;
    upgradeBtn.hidden = false;
    return;
  }

  text.textContent = "";
  trialBtn.hidden = !shouldStartTrial(settings);
  upgradeBtn.hidden = false;
}

function hydrateUi(settings: Settings): void {
  const status = getPremiumStatus(settings);

  document
    .querySelectorAll<HTMLLabelElement>(".feature")
    .forEach((label) => {
      const domKey = label.dataset.feature;
      if (!domKey) return;
      const key = toFeatureKey(domKey);
      if (!key) return;
      const input = label.querySelector<HTMLInputElement>(".feature__toggle");
      if (!input) return;
      input.checked = settings.features[key];
    });

  document
    .querySelectorAll<HTMLInputElement>('input[name="intensity"]')
    .forEach((input) => {
      input.checked = input.value === settings.intensity;
    });

  applyPremiumLockState(isPremiumActive(settings));
  renderPremiumSection(status, settings);
}

function flashSaved(): void {
  const indicator = document.getElementById("saved-indicator") as HTMLElement | null;
  if (!indicator) return;
  indicator.hidden = false;
  window.setTimeout(() => {
    indicator.hidden = true;
  }, 1500);
}

function wireEvents(): void {
  document
    .querySelectorAll<HTMLInputElement>(".feature__toggle")
    .forEach((input) => {
      input.addEventListener("change", async () => {
        const domKey = input.dataset.featureKey;
        if (!domKey) return;
        const key = toFeatureKey(domKey);
        if (!key) return;
        await setFeature(key, input.checked);
        flashSaved();
      });
    });

  document
    .querySelectorAll<HTMLInputElement>('input[name="intensity"]')
    .forEach((input) => {
      input.addEventListener("change", async () => {
        if (!input.checked) return;
        await setIntensity(input.value as Intensity);
        flashSaved();
      });
    });

  const resetBtn = document.getElementById(
    "reset-btn",
  ) as HTMLButtonElement | null;
  resetBtn?.addEventListener("click", async () => {
    await resetToDefaults();
    const settings = await loadSettings();
    hydrateUi(settings);
    flashSaved();
  });

  const trialBtn = document.getElementById(
    "trial-start-btn",
  ) as HTMLButtonElement | null;
  trialBtn?.addEventListener("click", async () => {
    await startTrial();
    const settings = await loadSettings();
    hydrateUi(settings);
    flashSaved();
  });

  const upgradeBtn = document.getElementById(
    "upgrade-btn",
  ) as HTMLButtonElement | null;
  upgradeBtn?.addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://github.com/tabisurushosai/calm-screen#premium",
    });
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
    init().catch((err) =>
      console.error("[calm-screen] options init failed", err),
    );
  });
} else {
  init().catch((err) =>
    console.error("[calm-screen] options init failed", err),
  );
}
