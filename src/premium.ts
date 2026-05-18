/**
 * @fileoverview Premium / trial business logic. Computes the user's current
 * tier ("paid" | "trial" | "free") and exposes feature-gating helpers used by
 * the popup, options page, and filter composer.
 */

import {
  PREMIUM_FEATURES,
  TRIAL_DURATION_MS,
  trialDaysRemaining,
  startTrial as storageStartTrial,
  setPremiumUnlocked as storageSetPremiumUnlocked,
  type FeatureKey,
  type Settings,
} from "./storage";

export { PREMIUM_FEATURES, TRIAL_DURATION_MS, trialDaysRemaining };
export const startTrial = storageStartTrial;
export const setPremiumUnlocked = storageSetPremiumUnlocked;

/** User's effective entitlement bucket. */
export type PremiumTier = "paid" | "trial" | "free";

/** Minimal slice of `Settings` needed to derive premium status. */
export type PremiumSnapshot = Pick<Settings, "premium_unlocked" | "trial_start_ts">;

/** Rich premium status used by UI surfaces (popup banner, options page). */
export interface PremiumStatus {
  tier: PremiumTier;
  isActive: boolean;
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  trialDaysRemaining: number;
}

/** `true` after a successful one-time purchase. */
export function isPremiumPaid(s: PremiumSnapshot): boolean {
  return s.premium_unlocked === true;
}

/** `true` once the trial has ever been initiated (regardless of expiry). */
export function isTrialStarted(s: PremiumSnapshot): boolean {
  return typeof s.trial_start_ts === "number" && s.trial_start_ts > 0;
}

/** Inside the 7-day trial window and not yet a paying customer. */
export function isTrialActive(s: PremiumSnapshot, now: number = Date.now()): boolean {
  if (isPremiumPaid(s)) return false;
  return trialDaysRemaining(s.trial_start_ts, now) > 0;
}

/** Trial was started but the 7-day window has elapsed. */
export function isTrialExpired(s: PremiumSnapshot, now: number = Date.now()): boolean {
  if (!isTrialStarted(s)) return false;
  return trialDaysRemaining(s.trial_start_ts, now) === 0;
}

/** Either paid premium or inside the trial window. */
export function isPremiumActive(s: PremiumSnapshot, now: number = Date.now()): boolean {
  return isPremiumPaid(s) || isTrialActive(s, now);
}

/** Reduce a snapshot to a single tier label for UI rendering. */
export function tierOf(s: PremiumSnapshot, now: number = Date.now()): PremiumTier {
  if (isPremiumPaid(s)) return "paid";
  if (isTrialActive(s, now)) return "trial";
  return "free";
}

/** Single-call helper returning every premium fact the UI needs. */
export function getPremiumStatus(s: PremiumSnapshot, now: number = Date.now()): PremiumStatus {
  const tier = tierOf(s, now);
  const trialStartedAt = isTrialStarted(s) ? (s.trial_start_ts as number) : null;
  const trialEndsAt = trialStartedAt !== null ? trialStartedAt + TRIAL_DURATION_MS : null;
  return {
    tier,
    isActive: tier !== "free",
    trialStartedAt,
    trialEndsAt,
    trialDaysRemaining: trialDaysRemaining(s.trial_start_ts, now),
  };
}

/** Whether the given feature is locked behind premium entitlement. */
export function isFeaturePremium(key: FeatureKey): boolean {
  return PREMIUM_FEATURES.has(key);
}

/**
 * Free features are always available; premium features require an active
 * premium status. The composer uses this to skip locked-out filters.
 */
export function isFeatureAvailable(
  key: FeatureKey,
  s: PremiumSnapshot,
  now: number = Date.now(),
): boolean {
  if (!isFeaturePremium(key)) return true;
  return isPremiumActive(s, now);
}

/**
 * `true` for users who can still start their one-and-only trial. Returns
 * `false` for paying customers and for anyone whose trial timestamp is
 * already set (active or expired).
 */
export function shouldStartTrial(s: PremiumSnapshot): boolean {
  if (isPremiumPaid(s)) return false;
  return !isTrialStarted(s);
}
