import type { Settings } from "../storage";
import * as blueFilter from "./blue-filter";
import * as desaturate from "./desaturate";
import * as darkForce from "./dark-force";

export function composeFilterValue(settings: Settings): string {
  if (!settings.enabled) return "";
  const parts: string[] = [];
  if (settings.features.blue_filter) {
    parts.push(blueFilter.toFilterValue(blueFilter.paramsFor(settings.intensity)));
  }
  if (settings.features.desaturate) {
    parts.push(desaturate.toFilterValue(desaturate.paramsFor(settings.intensity)));
  }
  if (settings.features.dark_force) {
    const v = darkForce.toFilterValue(darkForce.paramsFor(settings.intensity));
    if (v) parts.push(v);
  }
  return parts.filter((s) => s.length > 0).join(" ");
}
