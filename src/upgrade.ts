import { setPremiumUnlocked } from "./storage";

export const STRIPE_CHECKOUT_URL =
  "https://buy.stripe.com/test_REPLACE_WITH_REAL_PAYMENT_LINK";

export const PREMIUM_PRICE_USD = 3;

export interface CheckoutUrlOptions {
  baseUrl?: string;
  clientReferenceId?: string;
  prefilledEmail?: string;
  locale?: string;
}

const ALLOWED_LOCALES: ReadonlySet<string> = new Set(["auto", "en", "ja"]);

export function isValidCheckoutUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.length > 0;
  } catch {
    return false;
  }
}

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

export function generateClientReferenceId(
  randomFn: () => string = () =>
    globalThis.crypto?.randomUUID?.() ?? fallbackId(),
): string {
  return `cs_${randomFn()}`;
}

export async function openUpgradeCheckout(
  opts: CheckoutUrlOptions = {},
): Promise<chrome.tabs.Tab | undefined> {
  const url = buildCheckoutUrl(opts);
  return chrome.tabs.create({ url });
}

export async function markPremiumUnlocked(): Promise<void> {
  await setPremiumUnlocked(true);
}

export async function revokePremium(): Promise<void> {
  await setPremiumUnlocked(false);
}
