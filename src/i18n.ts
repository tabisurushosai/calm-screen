/**
 * @fileoverview chrome.i18n thin wrapper. Provides typed message keys and a
 * DOM-walker that applies translations to elements marked with `data-i18n`
 * (textContent) and `data-i18n-attr` (attribute values).
 */

/** Union of every message key declared in `_locales/<lang>/messages.json`. */
export type MessageKey =
  | "appName"
  | "appDesc"
  | "popup_title"
  | "popup_enable"
  | "popup_disable"
  | "popup_feature_blue_filter"
  | "popup_feature_blue_filter_desc"
  | "popup_feature_desaturate"
  | "popup_feature_desaturate_desc"
  | "popup_feature_animation_mute"
  | "popup_feature_animation_mute_desc"
  | "popup_feature_dark_force"
  | "popup_feature_dark_force_desc"
  | "popup_feature_brightness_cap"
  | "popup_feature_brightness_cap_desc"
  | "popup_open_options"
  | "popup_premium_badge"
  | "popup_trial_remaining"
  | "options_title"
  | "options_section_features"
  | "options_section_intensity"
  | "options_section_premium"
  | "options_section_about"
  | "options_intensity_low"
  | "options_intensity_medium"
  | "options_intensity_high"
  | "options_save"
  | "options_saved"
  | "options_reset"
  | "options_privacy_link"
  | "options_terms_link"
  | "premium_upgrade_button"
  | "premium_unlocked"
  | "premium_trial_start"
  | "premium_trial_expired"
  | "premium_feature_locked";

/**
 * Look up a localized message by key, falling back to the key itself when no
 * translation is registered (useful during development to surface missing
 * entries instead of rendering blank text).
 *
 * @param key Message key declared in `_locales/<lang>/messages.json`.
 * @param substitutions Positional values for `$1`, `$2`, ... placeholders.
 * @returns The localized string, or `key` when no entry exists.
 */
export function t(key: MessageKey, substitutions?: string | string[]): string {
  const message = chrome.i18n.getMessage(key, substitutions);
  return message || key;
}

/**
 * Translate every element under `root` that has a `data-i18n` (textContent) or
 * `data-i18n-attr="attr:key,attr2:key2"` (attribute) marker. Also sets the
 * root `<html lang>` attribute from `chrome.i18n.getUILanguage()` when unset.
 *
 * @param root Subtree to scan. Defaults to the whole document.
 */
export function applyI18n(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as MessageKey | undefined;
    if (!key) return;
    el.textContent = t(key);
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-attr]").forEach((el) => {
    const spec = el.dataset.i18nAttr;
    if (!spec) return;
    spec.split(",").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (!attr || !key) return;
      el.setAttribute(attr, t(key as MessageKey));
    });
  });

  const htmlEl = document.documentElement;
  const uiLang = chrome.i18n.getUILanguage?.();
  if (uiLang && !htmlEl.getAttribute("lang")) {
    htmlEl.setAttribute("lang", uiLang);
  }
}
