/** @fileoverview Unit tests for `upgrade.ts` — checkout URL builder,
 *  client-reference-id generation, and premium flag persistence helpers. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PREMIUM_PRICE_USD,
  STRIPE_CHECKOUT_URL,
  buildCheckoutUrl,
  generateClientReferenceId,
  isValidCheckoutUrl,
  markPremiumUnlocked,
  openUpgradeCheckout,
  revokePremium,
} from "./upgrade";

describe("upgrade constants", () => {
  it("PREMIUM_PRICE_USD is the documented $3 lifetime upgrade", () => {
    expect(PREMIUM_PRICE_USD).toBe(3);
  });

  it("STRIPE_CHECKOUT_URL is an https URL (no http/javascript: in shipped config)", () => {
    expect(isValidCheckoutUrl(STRIPE_CHECKOUT_URL)).toBe(true);
    expect(STRIPE_CHECKOUT_URL.startsWith("https://")).toBe(true);
  });
});

describe("isValidCheckoutUrl", () => {
  it("accepts https URLs", () => {
    expect(isValidCheckoutUrl("https://buy.stripe.com/abc")).toBe(true);
  });

  it("accepts http URLs (for local fixture use only)", () => {
    expect(isValidCheckoutUrl("http://localhost/x")).toBe(true);
  });

  it("rejects empty / malformed strings", () => {
    expect(isValidCheckoutUrl("")).toBe(false);
    expect(isValidCheckoutUrl("not a url")).toBe(false);
    expect(isValidCheckoutUrl("buy.stripe.com/abc")).toBe(false);
  });

  it("rejects unsafe schemes (javascript:, data:)", () => {
    expect(isValidCheckoutUrl("javascript:alert(1)")).toBe(false);
    expect(isValidCheckoutUrl("data:text/html,<script>")).toBe(false);
    expect(isValidCheckoutUrl("file:///etc/passwd")).toBe(false);
  });
});

describe("buildCheckoutUrl", () => {
  const base = "https://buy.stripe.com/test_link";

  it("returns the base URL unchanged when no opts provided (no trailing ?)", () => {
    const url = buildCheckoutUrl({ baseUrl: base });
    expect(url).toBe(base);
    expect(new URL(url).search).toBe("");
  });

  it("uses STRIPE_CHECKOUT_URL when no baseUrl provided", () => {
    const url = buildCheckoutUrl();
    expect(url.startsWith("https://")).toBe(true);
  });

  it("appends client_reference_id when provided", () => {
    const url = buildCheckoutUrl({ baseUrl: base, clientReferenceId: "cs_abc" });
    expect(new URL(url).searchParams.get("client_reference_id")).toBe("cs_abc");
  });

  it("appends prefilled_email when provided", () => {
    const url = buildCheckoutUrl({ baseUrl: base, prefilledEmail: "user@example.com" });
    expect(new URL(url).searchParams.get("prefilled_email")).toBe("user@example.com");
  });

  it("appends locale only for allowed values (ja, en, auto)", () => {
    for (const ok of ["ja", "en", "auto"]) {
      const url = buildCheckoutUrl({ baseUrl: base, locale: ok });
      expect(new URL(url).searchParams.get("locale")).toBe(ok);
    }
  });

  it("drops unknown locale values silently (no injection)", () => {
    const url = buildCheckoutUrl({ baseUrl: base, locale: "zz" });
    expect(new URL(url).searchParams.get("locale")).toBeNull();
  });

  it("combines multiple params in one URL", () => {
    const url = buildCheckoutUrl({
      baseUrl: base,
      clientReferenceId: "cs_xyz",
      prefilledEmail: "a@b.co",
      locale: "ja",
    });
    const u = new URL(url);
    expect(u.searchParams.get("client_reference_id")).toBe("cs_xyz");
    expect(u.searchParams.get("prefilled_email")).toBe("a@b.co");
    expect(u.searchParams.get("locale")).toBe("ja");
  });

  it("URL-encodes special characters in params (email +tag, &)", () => {
    const url = buildCheckoutUrl({
      baseUrl: base,
      prefilledEmail: "a+tag@b.co",
      clientReferenceId: "cs_a&b",
    });
    expect(url).toContain("prefilled_email=a%2Btag%40b.co");
    expect(url).toContain("client_reference_id=cs_a%26b");
  });

  it("throws on invalid baseUrl", () => {
    expect(() => buildCheckoutUrl({ baseUrl: "not a url" })).toThrow();
    expect(() => buildCheckoutUrl({ baseUrl: "javascript:alert(1)" })).toThrow();
  });

  it("ignores empty-string clientReferenceId / prefilledEmail (no empty params)", () => {
    const url = buildCheckoutUrl({
      baseUrl: base,
      clientReferenceId: "",
      prefilledEmail: "",
    });
    expect(new URL(url).search).toBe("");
  });
});

describe("generateClientReferenceId", () => {
  it("prefixes with cs_ for identifiability", () => {
    expect(generateClientReferenceId(() => "fixed-uuid")).toBe("cs_fixed-uuid");
  });

  it("uses crypto.randomUUID when available (default path)", () => {
    const id = generateClientReferenceId();
    expect(id).toMatch(/^cs_/);
    expect(id.length).toBeGreaterThan("cs_".length);
  });

  it("generates distinct values across calls", () => {
    const a = generateClientReferenceId();
    const b = generateClientReferenceId();
    expect(a).not.toBe(b);
  });
});

describe("openUpgradeCheckout", () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    };
  });

  it("opens a chrome tab with the built URL", async () => {
    await openUpgradeCheckout({
      baseUrl: "https://buy.stripe.com/abc",
      clientReferenceId: "cs_1",
    });
    const createMock = (
      globalThis as unknown as { chrome: { tabs: { create: ReturnType<typeof vi.fn> } } }
    ).chrome.tabs.create;
    expect(createMock).toHaveBeenCalledTimes(1);
    const arg = createMock.mock.calls[0][0] as { url: string };
    expect(arg.url).toContain("https://buy.stripe.com/abc");
    expect(arg.url).toContain("client_reference_id=cs_1");
  });

  it("propagates build errors (does not silently open garbage URL)", async () => {
    await expect(openUpgradeCheckout({ baseUrl: "not a url" })).rejects.toThrow();
    const createMock = (
      globalThis as unknown as { chrome: { tabs: { create: ReturnType<typeof vi.fn> } } }
    ).chrome.tabs.create;
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("markPremiumUnlocked / revokePremium", () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          set: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockResolvedValue({}),
        },
      },
    };
  });

  it("markPremiumUnlocked sets premium_unlocked=true in chrome.storage.local", async () => {
    await markPremiumUnlocked();
    const setMock = (
      globalThis as unknown as {
        chrome: { storage: { local: { set: ReturnType<typeof vi.fn> } } };
      }
    ).chrome.storage.local.set;
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ premium_unlocked: true });
  });

  it("revokePremium sets premium_unlocked=false in chrome.storage.local", async () => {
    await revokePremium();
    const setMock = (
      globalThis as unknown as {
        chrome: { storage: { local: { set: ReturnType<typeof vi.fn> } } };
      }
    ).chrome.storage.local.set;
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ premium_unlocked: false });
  });
});
