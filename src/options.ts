/**
 * @fileoverview Options page controller. Hydrates feature toggles + intensity
 * radios, manages premium UI (start trial / upgrade / unlocked), and persists
 * each change immediately with a brief "saved" flash.
 */

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
import { openUpgradeCheckout } from "./upgrade";

const FEATURE_KEY_MAP: Record<string, FeatureKey> = {
  "blue-filter": "blue_filter",
  desaturate: "desaturate",
  "animation-mute": "animation_mute",
  "dark-force": "dark_force",
  "brightness-cap": "brightness_cap",
};

/** Translate a kebab-case DOM key to the canonical snake-case storage key. */
function toFeatureKey(domKey: string): FeatureKey | null {
  return FEATURE_KEY_MAP[domKey] ?? null;
}

/** Disable + uncheck premium feature toggles when premium is inactive. */
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

/** Render the premium status text and toggle trial/upgrade buttons. */
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

/** Push the loaded settings into every input + the premium section. */
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

/** Briefly show the "saved" indicator (1.5s) after a setting persists. */
function flashSaved(): void {
  const indicator = document.getElementById("saved-indicator") as HTMLElement | null;
  if (!indicator) return;
  indicator.hidden = false;
  window.setTimeout(() => {
    indicator.hidden = true;
  }, 1500);
}

/**
 * Add Enter-key toggle support to a checkbox. Native checkboxes only respond
 * to Space; users coming from button-like controls (or screen-reader users
 * accustomed to Enter) expect Enter to work too.
 */
function enableEnterToggle(input: HTMLInputElement): void {
  input.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    if (input.disabled) return;
    ev.preventDefault();
    input.checked = !input.checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/**
 * Add Enter-key selection support to a radio. Native radios respond to arrow
 * keys; adding Enter matches user expectations for "confirm this choice".
 */
function enableEnterSelect(input: HTMLInputElement): void {
  input.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    if (input.disabled) return;
    if (input.checked) return;
    ev.preventDefault();
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Attach change-listeners to every interactive control. */
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
      enableEnterToggle(input);
    });

  document
    .querySelectorAll<HTMLInputElement>('input[name="intensity"]')
    .forEach((input) => {
      input.addEventListener("change", async () => {
        if (!input.checked) return;
        await setIntensity(input.value as Intensity);
        flashSaved();
      });
      enableEnterSelect(input);
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
    openUpgradeCheckout({ locale: chrome.i18n.getUILanguage().startsWith("ja") ? "ja" : "en" }).catch(
      (err) => console.error("[calm-screen] openUpgradeCheckout failed", err),
    );
  });
}

/** Entrypoint: i18n, then hydrate, then wire events. */
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
