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

export type PremiumTier = "paid" | "trial" | "free";

export type PremiumSnapshot = Pick<Settings, "premium_unlocked" | "trial_start_ts">;

export interface PremiumStatus {
  tier: PremiumTier;
  isActive: boolean;
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  trialDaysRemaining: number;
}

export function isPremiumPaid(s: PremiumSnapshot): boolean {
  return s.premium_unlocked === true;
}

export function isTrialStarted(s: PremiumSnapshot): boolean {
  return typeof s.trial_start_ts === "number" && s.trial_start_ts > 0;
}

export function isTrialActive(s: PremiumSnapshot, now: number = Date.now()): boolean {
  if (isPremiumPaid(s)) return false;
  return trialDaysRemaining(s.trial_start_ts, now) > 0;
}

export function isTrialExpired(s: PremiumSnapshot, now: number = Date.now()): boolean {
  if (!isTrialStarted(s)) return false;
  return trialDaysRemaining(s.trial_start_ts, now) === 0;
}

export function isPremiumActive(s: PremiumSnapshot, now: number = Date.now()): boolean {
  return isPremiumPaid(s) || isTrialActive(s, now);
}

export function tierOf(s: PremiumSnapshot, now: number = Date.now()): PremiumTier {
  if (isPremiumPaid(s)) return "paid";
  if (isTrialActive(s, now)) return "trial";
  return "free";
}

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

export function isFeaturePremium(key: FeatureKey): boolean {
  return PREMIUM_FEATURES.has(key);
}

export function isFeatureAvailable(
  key: FeatureKey,
  s: PremiumSnapshot,
  now: number = Date.now(),
): boolean {
  if (!isFeaturePremium(key)) return true;
  return isPremiumActive(s, now);
}

export function shouldStartTrial(s: PremiumSnapshot): boolean {
  if (isPremiumPaid(s)) return false;
  return !isTrialStarted(s);
}
