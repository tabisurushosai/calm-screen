import type { Settings } from "../storage";
import { isFeatureAvailable } from "../premium";
import * as blueFilter from "./blue-filter";
import * as desaturate from "./desaturate";
import * as brightnessCap from "./brightness-cap";
import * as darkForce from "./dark-force";

export function composeFilterValue(settings: Settings, now: number = Date.now()): string {
  if (!settings.enabled) return "";
  const parts: string[] = [];
  if (
    settings.features.blue_filter &&
    isFeatureAvailable("blue_filter", settings, now)
  ) {
    parts.push(blueFilter.toFilterValue(blueFilter.paramsFor(settings.intensity)));
  }
  if (
    settings.features.desaturate &&
    isFeatureAvailable("desaturate", settings, now)
  ) {
    parts.push(desaturate.toFilterValue(desaturate.paramsFor(settings.intensity)));
  }
  if (
    settings.features.brightness_cap &&
    isFeatureAvailable("brightness_cap", settings, now)
  ) {
    parts.push(brightnessCap.toFilterValue(brightnessCap.paramsFor(settings.intensity)));
  }
  if (
    settings.features.dark_force &&
    isFeatureAvailable("dark_force", settings, now)
  ) {
    const v = darkForce.toFilterValue(darkForce.paramsFor(settings.intensity));
    if (v) parts.push(v);
  }
  return parts.filter((s) => s.length > 0).join(" ");
}
