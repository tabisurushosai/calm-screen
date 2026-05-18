/**
 * @fileoverview Premium-upgrade flow. Builds the Stripe Checkout URL with a
 * generated `client_reference_id` (so the webhook can identify the user
 * later), opens it in a new tab, and exposes helpers to mark or revoke the
 * paid-premium flag in storage.
 */

import { setPremiumUnlocked } from "./storage";

export const STRIPE_CHECKOUT_URL =
  "https://buy.stripe.com/test_REPLACE_WITH_REAL_PAYMENT_LINK";

export const PREMIUM_PRICE_USD = 3;

/** Optional inputs passed to {@link buildCheckoutUrl}. */
export interface CheckoutUrlOptions {
  baseUrl?: string;
  clientReferenceId?: string;
  prefilledEmail?: string;
  locale?: string;
}

const ALLOWED_LOCALES: ReadonlySet<string> = new Set(["auto", "en", "ja"]);

/** Loose URL sanity check (must be http/https with a non-empty host). */
export function isValidCheckoutUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Assemble the Stripe Checkout URL, appending the supported query parameters.
 * Throws synchronously on an invalid base URL so the bug surfaces at the
 * call-site instead of during a tab open.
 */
export function buildCheckoutUrl(opts: CheckoutUrlOptions = {}): string {
  const base = opts.baseUrl ?? STRIPE_CHECKOUT_URL;
  if (!isValidCheckoutUrl(base)) {
    throw new Error(`[calm-screen] invalid checkout base URL: ${base}`);
  }
  const url = new URL(base);
  if (opts.clientReferenceId) {
    url.searchParams.set("client_reference_id", opts.clientReferenceId);
  }
  if (opts.prefilledEmail) {
    url.searchParams.set("prefilled_email", opts.prefilledEmail);
  }
  if (opts.locale && ALLOWED_LOCALES.has(opts.locale)) {
    url.searchParams.set("locale", opts.locale);
  }
  return url.toString();
}

function fallbackId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Generate a `cs_`-prefixed reference id, preferring `crypto.randomUUID` when
 * available. The webhook joins this id back to a user's storage record.
 */
export function generateClientReferenceId(
  randomFn: () => string = () =>
    globalThis.crypto?.randomUUID?.() ?? fallbackId(),
): string {
  return `cs_${randomFn()}`;
}

/** Open the Stripe Checkout page in a new tab. */
export async function openUpgradeCheckout(
  opts: CheckoutUrlOptions = {},
): Promise<chrome.tabs.Tab | undefined> {
  const url = buildCheckoutUrl(opts);
  try {
    return await chrome.tabs.create({ url });
  } catch (err) {
    console.error("[calm-screen] chrome.tabs.create failed", err);
    throw err;
  }
}

/** Flip the paid-premium flag in storage (typically after webhook success). */
export async function markPremiumUnlocked(): Promise<void> {
  await setPremiumUnlocked(true);
}

/** Revoke paid premium (for tests / manual rollback). */
export async function revokePremium(): Promise<void> {
  await setPremiumUnlocked(false);
}
