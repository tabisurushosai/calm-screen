/** @fileoverview Unit tests for `premium.ts` — tier inference, trial-window
 *  math, and feature-gating helpers across paid/trial/free/expired states. */
import { describe, it, expect } from "vitest";
import {
  TRIAL_DURATION_MS,
  getPremiumStatus,
  isFeatureAvailable,
  isFeaturePremium,
  isPremiumActive,
  isPremiumPaid,
  isTrialActive,
  isTrialExpired,
  isTrialStarted,
  shouldStartTrial,
  tierOf,
  type PremiumSnapshot,
} from "./premium";
import { FEATURE_KEYS, PREMIUM_FEATURES, type FeatureKey } from "./storage";

const NOW = 1_700_000_000_000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function snap(over: Partial<PremiumSnapshot> = {}): PremiumSnapshot {
  return {
    premium_unlocked: false,
    trial_start_ts: null,
    ...over,
  };
}

describe("premium predicates — paid", () => {
  it("isPremiumPaid is true only when premium_unlocked === true", () => {
    expect(isPremiumPaid(snap({ premium_unlocked: true }))).toBe(true);
    expect(isPremiumPaid(snap({ premium_unlocked: false }))).toBe(false);
  });

  it("isTrialActive is false for paid users even if trial_start_ts is within window", () => {
    expect(
      isTrialActive(snap({ premium_unlocked: true, trial_start_ts: NOW - ONE_DAY }), NOW),
    ).toBe(false);
  });

  it("isPremiumActive is true for paid users with no trial", () => {
    expect(isPremiumActive(snap({ premium_unlocked: true }), NOW)).toBe(true);
  });

  it("tierOf returns 'paid' even when trial would also be active (paid precedence)", () => {
    expect(tierOf(snap({ premium_unlocked: true, trial_start_ts: NOW - ONE_DAY }), NOW)).toBe(
      "paid",
    );
  });
});

describe("premium predicates — trial", () => {
  it("isTrialStarted is true iff trial_start_ts is a positive number", () => {
    expect(isTrialStarted(snap({ trial_start_ts: null }))).toBe(false);
    expect(isTrialStarted(snap({ trial_start_ts: 0 }))).toBe(false);
    expect(isTrialStarted(snap({ trial_start_ts: NOW }))).toBe(true);
  });

  it("isTrialActive is true inside the 7-day window, false after", () => {
    const justStarted = snap({ trial_start_ts: NOW });
    expect(isTrialActive(justStarted, NOW)).toBe(true);
    expect(isTrialActive(justStarted, NOW + 6 * ONE_DAY)).toBe(true);
    expect(isTrialActive(justStarted, NOW + TRIAL_DURATION_MS)).toBe(false);
    expect(isTrialActive(justStarted, NOW + TRIAL_DURATION_MS + 1)).toBe(false);
  });

  it("isTrialExpired distinguishes 'never started' (false) from 'started+over' (true)", () => {
    expect(isTrialExpired(snap({ trial_start_ts: null }), NOW)).toBe(false);
    expect(isTrialExpired(snap({ trial_start_ts: NOW - TRIAL_DURATION_MS }), NOW)).toBe(true);
    expect(isTrialExpired(snap({ trial_start_ts: NOW }), NOW)).toBe(false);
  });

  it("tierOf returns 'trial' while active and 'free' once expired", () => {
    expect(tierOf(snap({ trial_start_ts: NOW }), NOW)).toBe("trial");
    expect(tierOf(snap({ trial_start_ts: NOW - TRIAL_DURATION_MS }), NOW)).toBe("free");
  });

  it("isPremiumActive is true during trial and false after expiry", () => {
    expect(isPremiumActive(snap({ trial_start_ts: NOW }), NOW)).toBe(true);
    expect(isPremiumActive(snap({ trial_start_ts: NOW - TRIAL_DURATION_MS }), NOW)).toBe(false);
  });
});

describe("premium predicates — free", () => {
  it("defaults to free with no trial and no purchase", () => {
    const s = snap();
    expect(tierOf(s, NOW)).toBe("free");
    expect(isPremiumActive(s, NOW)).toBe(false);
    expect(isPremiumPaid(s)).toBe(false);
    expect(isTrialActive(s, NOW)).toBe(false);
    expect(isTrialStarted(s)).toBe(false);
  });
});

describe("getPremiumStatus snapshot shape", () => {
  it("free → tier=free, isActive=false, trial fields null", () => {
    const status = getPremiumStatus(snap(), NOW);
    expect(status).toEqual({
      tier: "free",
      isActive: false,
      trialStartedAt: null,
      trialEndsAt: null,
      trialDaysRemaining: 0,
    });
  });

  it("trial → tier=trial, isActive=true, trialEndsAt = start + 7d", () => {
    const start = NOW - 2 * ONE_DAY;
    const status = getPremiumStatus(snap({ trial_start_ts: start }), NOW);
    expect(status.tier).toBe("trial");
    expect(status.isActive).toBe(true);
    expect(status.trialStartedAt).toBe(start);
    expect(status.trialEndsAt).toBe(start + TRIAL_DURATION_MS);
    expect(status.trialDaysRemaining).toBeGreaterThan(0);
  });

  it("paid → tier=paid, isActive=true, preserves trialStartedAt if also set", () => {
    const start = NOW - ONE_DAY;
    const status = getPremiumStatus(
      snap({ premium_unlocked: true, trial_start_ts: start }),
      NOW,
    );
    expect(status.tier).toBe("paid");
    expect(status.isActive).toBe(true);
    expect(status.trialStartedAt).toBe(start);
    expect(status.trialEndsAt).toBe(start + TRIAL_DURATION_MS);
  });

  it("expired trial → tier=free, isActive=false, days=0 (no negatives)", () => {
    const status = getPremiumStatus(
      snap({ trial_start_ts: NOW - TRIAL_DURATION_MS - 5 * ONE_DAY }),
      NOW,
    );
    expect(status.tier).toBe("free");
    expect(status.isActive).toBe(false);
    expect(status.trialDaysRemaining).toBe(0);
  });
});

describe("feature gating", () => {
  it("isFeaturePremium matches the PREMIUM_FEATURES set verbatim", () => {
    for (const key of FEATURE_KEYS) {
      expect(isFeaturePremium(key)).toBe(PREMIUM_FEATURES.has(key));
    }
  });

  it("brightness_cap is currently the only premium feature in v1", () => {
    expect(isFeaturePremium("brightness_cap")).toBe(true);
    const nonPremium: FeatureKey[] = [
      "blue_filter",
      "desaturate",
      "animation_mute",
      "dark_force",
    ];
    for (const key of nonPremium) {
      expect(isFeaturePremium(key)).toBe(false);
    }
  });

  it("free features are always available regardless of premium state", () => {
    const free = snap();
    expect(isFeatureAvailable("blue_filter", free, NOW)).toBe(true);
    expect(isFeatureAvailable("desaturate", free, NOW)).toBe(true);
    expect(isFeatureAvailable("animation_mute", free, NOW)).toBe(true);
    expect(isFeatureAvailable("dark_force", free, NOW)).toBe(true);
  });

  it("premium features are gated for free users", () => {
    expect(isFeatureAvailable("brightness_cap", snap(), NOW)).toBe(false);
  });

  it("premium features are available during trial", () => {
    expect(
      isFeatureAvailable("brightness_cap", snap({ trial_start_ts: NOW }), NOW),
    ).toBe(true);
  });

  it("premium features are available for paid users", () => {
    expect(
      isFeatureAvailable("brightness_cap", snap({ premium_unlocked: true }), NOW),
    ).toBe(true);
  });

  it("premium features lock again after trial expires (without purchase)", () => {
    expect(
      isFeatureAvailable(
        "brightness_cap",
        snap({ trial_start_ts: NOW - TRIAL_DURATION_MS }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("shouldStartTrial", () => {
  it("true for fresh free user with no trial yet", () => {
    expect(shouldStartTrial(snap())).toBe(true);
  });

  it("false once a trial has been started (do not re-roll the clock)", () => {
    expect(shouldStartTrial(snap({ trial_start_ts: NOW }))).toBe(false);
  });

  it("false after trial expired (one-shot — cannot re-trigger)", () => {
    expect(shouldStartTrial(snap({ trial_start_ts: NOW - TRIAL_DURATION_MS }))).toBe(false);
  });

  it("false for paid users (no point starting a trial they already exceed)", () => {
    expect(shouldStartTrial(snap({ premium_unlocked: true }))).toBe(false);
  });
});

describe("default snapshot invariants", () => {
  it("a default-like snapshot (free, no trial) is identically 'free' tier", () => {
    const s = snap();
    expect(tierOf(s, NOW)).toBe("free");
    for (const key of FEATURE_KEYS) {
      const available = isFeatureAvailable(key, s, NOW);
      expect(available).toBe(!PREMIUM_FEATURES.has(key));
    }
  });
});
