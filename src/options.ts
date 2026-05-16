import { applyI18n, t } from "./i18n";

type FeatureKey =
  | "blue_filter"
  | "desaturate"
  | "animation_mute"
  | "dark_force"
  | "brightness_cap";

type Intensity = "low" | "medium" | "high";

interface StoredSettings {
  enabled: boolean;
  features: Record<FeatureKey, boolean>;
  intensity: Intensity;
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

const DEFAULTS: StoredSettings = {
  enabled: true,
  features: {
    blue_filter: true,
    desaturate: true,
    animation_mute: true,
    dark_force: false,
    brightness_cap: false,
  },
  intensity: "medium",
  premium_unlocked: false,
  trial_start_ts: null,
};

function toFeatureKey(domKey: string): FeatureKey | null {
  return FEATURE_KEY_MAP[domKey] ?? null;
}

async function loadSettings(): Promise<StoredSettings> {
  const raw = (await chrome.storage.local.get([
    "enabled",
    "features",
    "intensity",
    "premium_unlocked",
    "trial_start_ts",
  ])) as Partial<StoredSettings>;

  return {
    enabled: raw.enabled ?? DEFAULTS.enabled,
    features: {
      blue_filter: raw.features?.blue_filter ?? DEFAULTS.features.blue_filter,
      desaturate: raw.features?.desaturate ?? DEFAULTS.features.desaturate,
      animation_mute:
        raw.features?.animation_mute ?? DEFAULTS.features.animation_mute,
      dark_force: raw.features?.dark_force ?? DEFAULTS.features.dark_force,
      brightness_cap:
        raw.features?.brightness_cap ?? DEFAULTS.features.brightness_cap,
    },
    intensity: raw.intensity ?? DEFAULTS.intensity,
    premium_unlocked: raw.premium_unlocked ?? DEFAULTS.premium_unlocked,
    trial_start_ts: raw.trial_start_ts ?? DEFAULTS.trial_start_ts,
  };
}

function trialDaysRemaining(trialStartTs: number | null): number {
  if (!trialStartTs) return 0;
  const elapsed = Date.now() - trialStartTs;
  const remaining = Math.ceil(
    (TRIAL_DURATION_MS - elapsed) / (24 * 60 * 60 * 1000),
  );
  return Math.max(0, remaining);
}

function isPremiumActive(settings: StoredSettings): boolean {
  if (settings.premium_unlocked) return true;
  return trialDaysRemaining(settings.trial_start_ts) > 0;
}

function applyPremiumLockState(premiumActive: boolean): void {
  document
    .querySelectorAll<HTMLLabelElement>(".feature")
    .forEach((label) => {
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

function renderPremiumSection(settings: StoredSettings): void {
  const text = document.getElementById("premium-status-text");
  const trialBtn = document.getElementById(
    "trial-start-btn",
  ) as HTMLButtonElement | null;
  const upgradeBtn = document.getElementById(
    "upgrade-btn",
  ) as HTMLButtonElement | null;
  if (!text || !trialBtn || !upgradeBtn) return;

  if (settings.premium_unlocked) {
    text.textContent = t("premium_unlocked");
    trialBtn.hidden = true;
    upgradeBtn.hidden = true;
    return;
  }

  const days = trialDaysRemaining(settings.trial_start_ts);
  if (settings.trial_start_ts && days > 0) {
    text.textContent = t("popup_trial_remaining", String(days));
    trialBtn.hidden = true;
    upgradeBtn.hidden = false;
    return;
  }

  if (settings.trial_start_ts && days === 0) {
    text.textContent = t("premium_trial_expired");
    trialBtn.hidden = true;
    upgradeBtn.hidden = false;
    return;
  }

  text.textContent = "";
  trialBtn.hidden = false;
  upgradeBtn.hidden = false;
}

function hydrateUi(settings: StoredSettings): void {
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
  renderPremiumSection(settings);
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
        const current = (await chrome.storage.local.get("features")) as {
          features?: Record<FeatureKey, boolean>;
        };
        const next = { ...(current.features ?? {}), [key]: input.checked };
        await chrome.storage.local.set({ features: next });
        flashSaved();
      });
    });

  document
    .querySelectorAll<HTMLInputElement>('input[name="intensity"]')
    .forEach((input) => {
      input.addEventListener("change", async () => {
        if (!input.checked) return;
        const intensity = input.value as Intensity;
        await chrome.storage.local.set({ intensity });
        flashSaved();
      });
    });

  const resetBtn = document.getElementById(
    "reset-btn",
  ) as HTMLButtonElement | null;
  resetBtn?.addEventListener("click", async () => {
    await chrome.storage.local.set({
      enabled: DEFAULTS.enabled,
      features: DEFAULTS.features,
      intensity: DEFAULTS.intensity,
    });
    const settings = await loadSettings();
    hydrateUi(settings);
    flashSaved();
  });

  const trialBtn = document.getElementById(
    "trial-start-btn",
  ) as HTMLButtonElement | null;
  trialBtn?.addEventListener("click", async () => {
    await chrome.storage.local.set({ trial_start_ts: Date.now() });
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
