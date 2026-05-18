/** @fileoverview Audits `_locales/{ja,en}/messages.json` against the source
 *  tree: enforces ja/en key parity, identical placeholder shapes, non-empty
 *  messages, and that every defined key is referenced somewhere (HTML
 *  data-i18n / data-i18n-attr, src/ `t("...")` calls, or manifest.json
 *  `__MSG_..._`), and conversely that every referenced key is defined. */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const JA_PATH = join(ROOT, "_locales/ja/messages.json");
const EN_PATH = join(ROOT, "_locales/en/messages.json");

type Entry = {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
};
type Catalog = Record<string, Entry>;

const ja = JSON.parse(readFileSync(JA_PATH, "utf8")) as Catalog;
const en = JSON.parse(readFileSync(EN_PATH, "utf8")) as Catalog;

const SCAN_DIRS = ["src", "manifest.json"];
const SCAN_EXT = /\.(ts|js|html|json)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "release",
  "_locales",
]);

function collectScannedSource(): string {
  const chunks: string[] = [];
  const walk = (p: string): void => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (SKIP_DIRS.has(name)) continue;
        walk(join(p, name));
      }
      return;
    }
    if (!SCAN_EXT.test(p)) return;
    chunks.push(readFileSync(p, "utf8"));
  };
  for (const rel of SCAN_DIRS) {
    walk(join(ROOT, rel));
  }
  return chunks.join("\n");
}

const SOURCE = collectScannedSource();

function referencesKey(key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(SOURCE);
}

describe("i18n catalog parity", () => {
  it("ja and en define the same set of keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
  });

  it("every key has a non-empty message in both locales", () => {
    for (const [key, entry] of Object.entries(ja)) {
      expect(entry.message, `ja[${key}]`).toBeTruthy();
    }
    for (const [key, entry] of Object.entries(en)) {
      expect(entry.message, `en[${key}]`).toBeTruthy();
    }
  });

  it("placeholder names are identical per key across ja and en", () => {
    for (const key of Object.keys(ja)) {
      const jaPh = Object.keys(ja[key].placeholders ?? {}).sort();
      const enPh = Object.keys(en[key].placeholders ?? {}).sort();
      expect(enPh, `placeholders for ${key}`).toEqual(jaPh);
    }
  });
});

describe("i18n usage audit", () => {
  it("every defined key is referenced somewhere in the source tree", () => {
    const orphaned = Object.keys(ja).filter((k) => !referencesKey(k));
    expect(orphaned).toEqual([]);
  });

  it("every key referenced via data-i18n / data-i18n-attr is defined", () => {
    const htmlSources: string[] = [];
    const walk = (p: string): void => {
      const st = statSync(p);
      if (st.isDirectory()) {
        for (const name of readdirSync(p)) {
          if (SKIP_DIRS.has(name)) continue;
          walk(join(p, name));
        }
        return;
      }
      if (p.endsWith(".html")) htmlSources.push(readFileSync(p, "utf8"));
    };
    walk(join(ROOT, "src"));
    const html = htmlSources.join("\n");

    const used = new Set<string>();
    const htmlRe = /data-i18n(?:-attr)?="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = htmlRe.exec(html)) !== null) {
      const spec = m[1];
      if (spec.includes(":")) {
        for (const pair of spec.split(",")) {
          const [, key] = pair.split(":").map((s) => s.trim());
          if (key) used.add(key);
        }
      } else {
        used.add(spec.trim());
      }
    }
    const undef = [...used].filter((k) => !(k in ja));
    expect(undef).toEqual([]);
  });

  it("every key passed to t() is defined", () => {
    const used = new Set<string>();
    const tCallRe = /\bt\(\s*"([a-z][a-z0-9_]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = tCallRe.exec(SOURCE)) !== null) {
      used.add(m[1]);
    }
    const knownNonI18nT = new Set<string>([
      "change",
      "features",
      "schema_version",
      "style",
      "client_reference_id",
      "prefilled_email",
      "locale",
      "video",
      "audio",
      "div",
      "span",
      "a",
    ]);
    const undef = [...used].filter(
      (k) => !(k in ja) && !knownNonI18nT.has(k),
    );
    expect(undef).toEqual([]);
  });

  it("every __MSG_..._ reference in manifest.json is defined", () => {
    const manifest = readFileSync(join(ROOT, "manifest.json"), "utf8");
    const msgRe = /__MSG_([a-zA-Z][a-zA-Z0-9_]*)__/g;
    const used = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = msgRe.exec(manifest)) !== null) {
      used.add(m[1]);
    }
    const undef = [...used].filter((k) => !(k in ja));
    expect(undef).toEqual([]);
  });
});
