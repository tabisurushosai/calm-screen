import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  STYLE_ELEMENT_ID,
  apply,
  paramsFor,
  remove,
  toCss,
} from "./animation-mute";
import { INTENSITY_VALUES, type Intensity } from "../storage";

describe("animation-mute pure helpers", () => {
  it("returns the documented params for each intensity", () => {
    expect(paramsFor("low")).toEqual({ duration: "200ms", killAutoplay: false });
    expect(paramsFor("medium")).toEqual({ duration: "1ms", killAutoplay: false });
    expect(paramsFor("high")).toEqual({ duration: "1ms", killAutoplay: true });
  });

  it("monotonically shortens (or holds) duration as intensity rises", () => {
    const order: Intensity[] = ["low", "medium", "high"];
    const durations = order.map((i) => parseFloat(paramsFor(i).duration));
    for (let i = 1; i < durations.length; i++) {
      expect(durations[i]).toBeLessThanOrEqual(durations[i - 1]);
    }
  });

  it("enables killAutoplay only at high intensity", () => {
    expect(paramsFor("low").killAutoplay).toBe(false);
    expect(paramsFor("medium").killAutoplay).toBe(false);
    expect(paramsFor("high").killAutoplay).toBe(true);
  });

  it("covers every Intensity value declared in storage", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(() => paramsFor(intensity)).not.toThrow();
    }
  });

  it("formats CSS that mutes animation, transition and smooth scroll", () => {
    const css = toCss(paramsFor("medium"));
    expect(css).toContain("animation-duration:1ms !important");
    expect(css).toContain("animation-delay:0s !important");
    expect(css).toContain("animation-iteration-count:1 !important");
    expect(css).toContain("transition-duration:1ms !important");
    expect(css).toContain("transition-delay:0s !important");
    expect(css).toContain("scroll-behavior:auto !important");
  });

  it("adds will-change reset only when killAutoplay is on", () => {
    expect(toCss(paramsFor("low"))).not.toContain("will-change");
    expect(toCss(paramsFor("medium"))).not.toContain("will-change");
    expect(toCss(paramsFor("high"))).toContain("will-change:auto !important");
  });

  it("targets universal selector with pseudo-elements", () => {
    const css = toCss(paramsFor("low"));
    expect(css).toContain("*,*::before,*::after");
  });

  it("never produces an empty CSS string for any intensity", () => {
    for (const intensity of INTENSITY_VALUES) {
      expect(toCss(paramsFor(intensity)).length).toBeGreaterThan(0);
    }
  });
});

describe("animation-mute DOM side effects", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  afterEach(() => {
    remove(document);
    document.body.innerHTML = "";
  });

  it("apply injects a single <style> with the expected id", () => {
    apply(document, paramsFor("low"));
    const styles = document.querySelectorAll(`#${STYLE_ELEMENT_ID}`);
    expect(styles.length).toBe(1);
    expect((styles[0] as HTMLStyleElement).textContent).toContain("animation-duration:200ms");
  });

  it("apply is idempotent across repeat calls with the same params", () => {
    apply(document, paramsFor("medium"));
    apply(document, paramsFor("medium"));
    apply(document, paramsFor("medium"));
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`).length).toBe(1);
  });

  it("apply updates the <style> textContent when params change", () => {
    apply(document, paramsFor("low"));
    apply(document, paramsFor("medium"));
    const style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    expect(style).not.toBeNull();
    expect(style!.textContent).toContain("animation-duration:1ms");
    expect(style!.textContent).not.toContain("animation-duration:200ms");
  });

  it("does not touch <html> inline style (animation props target every element, not html)", () => {
    apply(document, paramsFor("high"));
    expect(document.documentElement.style.getPropertyValue("filter")).toBe("");
    expect(document.documentElement.style.getPropertyValue("animation-duration")).toBe("");
  });

  it("remove deletes the <style> element", () => {
    apply(document, paramsFor("medium"));
    remove(document);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });

  it("remove is safe to call when nothing has been applied", () => {
    expect(() => remove(document)).not.toThrow();
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });
});

describe("animation-mute autoplay observer", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  });

  afterEach(() => {
    remove(document);
    document.body.innerHTML = "";
  });

  it("pauses existing autoplay <video> when intensity is high", () => {
    const video = document.createElement("video");
    video.setAttribute("autoplay", "");
    document.body.appendChild(video);
    const pauseSpy = vi.spyOn(video, "pause");

    apply(document, paramsFor("high"));

    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("pauses existing autoplay <audio> when intensity is high", () => {
    const audio = document.createElement("audio");
    audio.setAttribute("autoplay", "");
    document.body.appendChild(audio);
    const pauseSpy = vi.spyOn(audio, "pause");

    apply(document, paramsFor("high"));

    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("ignores videos without autoplay attribute", () => {
    const video = document.createElement("video");
    document.body.appendChild(video);
    const pauseSpy = vi.spyOn(video, "pause");

    apply(document, paramsFor("high"));

    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it("does NOT pause autoplay media at low or medium intensity", () => {
    const video = document.createElement("video");
    video.setAttribute("autoplay", "");
    document.body.appendChild(video);
    const pauseSpy = vi.spyOn(video, "pause");

    apply(document, paramsFor("low"));
    apply(document, paramsFor("medium"));

    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it("pauses dynamically inserted autoplay videos via MutationObserver", async () => {
    apply(document, paramsFor("high"));

    const video = document.createElement("video");
    video.setAttribute("autoplay", "");
    const pauseSpy = vi.spyOn(video, "pause");
    document.body.appendChild(video);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("pauses autoplay videos nested inside dynamically inserted containers", async () => {
    apply(document, paramsFor("high"));

    const wrapper = document.createElement("div");
    const video = document.createElement("video");
    video.setAttribute("autoplay", "");
    wrapper.appendChild(video);
    const pauseSpy = vi.spyOn(video, "pause");
    document.body.appendChild(wrapper);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("does not pause the same element twice", async () => {
    const video = document.createElement("video");
    video.setAttribute("autoplay", "");
    document.body.appendChild(video);
    const pauseSpy = vi.spyOn(video, "pause");

    apply(document, paramsFor("high"));
    // Trigger another mutation that re-attaches the element
    document.body.appendChild(document.createElement("span"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pauseSpy).toHaveBeenCalledTimes(1);
  });

  it("stops observing autoplay nodes after remove()", async () => {
    apply(document, paramsFor("high"));
    remove(document);

    const video = document.createElement("video");
    video.setAttribute("autoplay", "");
    const pauseSpy = vi.spyOn(video, "pause");
    document.body.appendChild(video);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it("stops observing when intensity drops from high to medium", async () => {
    apply(document, paramsFor("high"));
    apply(document, paramsFor("medium"));

    const video = document.createElement("video");
    video.setAttribute("autoplay", "");
    const pauseSpy = vi.spyOn(video, "pause");
    document.body.appendChild(video);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it("tolerates pause() throwing (best-effort)", () => {
    const video = document.createElement("video");
    video.setAttribute("autoplay", "");
    document.body.appendChild(video);
    vi.spyOn(video, "pause").mockImplementation(() => {
      throw new Error("nope");
    });

    expect(() => apply(document, paramsFor("high"))).not.toThrow();
  });
});
