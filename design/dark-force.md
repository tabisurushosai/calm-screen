# Design: dark-force

視覚過敏・羞明 (photophobia) 向けの「ダークモード強制」機能。サイトがダークテーマに対応していなくても、コンテンツスクリプトでページ全体を暗背景・明文字に近づけ、白背景の眩しさによる眼精疲労・頭痛・吐き気を軽減する。

## 目的
- 白背景ベースのサイト (Wikipedia, ニュース, 学習プラットフォーム等) を強制的にダーク化し、夜間や暗い室内での閲覧負荷を下げる。
- 不登校児・発達特性児・羞明傾向の保護者などが、自宅で長時間学習サイトを開いても眼が疲れにくい状態を提供する。
- OS のダークモードに追従しないサイトを、サイト側の対応を待たずに一律ダーク化する。
- ブラウザの実験フラグ "Auto Dark Mode for Web Contents" に依存せず、ユーザー操作で確実に ON/OFF できる手段を提供する。

## ユーザー体験
- ポップアップで `dark_force` トグル ON/OFF。
- オプション画面の `intensity` (low/medium/high) を全機能共通で参照。
  - low: `color-scheme: dark` を強制し、ブラウザのフォーム既定スタイル・スクロールバー・`<input>` 等の OS スタイルだけをダーク化。本文には `filter` を当てない。サイトが半ばダーク対応している場合の補助。
  - medium: low に加えて、`html` に `filter: invert(1) hue-rotate(180deg)` を合成し、画像・動画・`<iframe>`・`<svg>` を再反転 (`filter: invert(1) hue-rotate(180deg)`) して原色に戻す。一般的な「無理やりダークモード」相当。
  - high: medium に加えて、`background-image` を持つ `*` も再反転 (CSS 変数経由) し、`canvas` も再反転対象に含める。背景画像が暗くなりすぎる副作用を許容する代わりに、白背景が残るケースを最小化する。
- マスタートグル `enabled=false` のときは即座に無効化される (`src/content.ts` の `reconcile` 経路に乗る)。
- すでにダーク配色のサイト (background が暗い) でも一律に反転するため、低 (low) 強度を既定とし、medium/high はユーザーが明示的に選ぶ建付け。
  - 自動検出はサイト側 CSS 計算が必要で `document_start` には間に合わないため v1 非対応。

## アプローチ

### 2 系統に分けた適用
1. **filter 合成パスへの寄与** (medium/high のみ)
   - `src/features/dark-force.ts` が `toFilterValue(p)` を export。
   - `src/features/compose.ts` (T020 で導入済み) の `composeFilterValue(settings)` に dark-force の寄与を追加し、`html { filter: ... }` に `invert(1) hue-rotate(180deg)` を合成する。
   - これにより [[blue-filter]] / [[desaturate]] と単一 `filter` プロパティ上で共存する。
   - **適用順**: `invert(...) hue-rotate(...)` を**最後**に置く。color-temperature 系 (blue-filter の sepia/hue-rotate) → saturate (desaturate) → invert+hue-rotate (dark-force) の順。invert を最後にしないと、色温度補正の意図が反転後の色空間に持ち込まれて意図しない色相に振れる。
   - 値は `src/features/dark-force.ts` 内に定数として持ち、テストで参照可能にする。
2. **専用 `<style>` タグ (画像/動画 等の再反転)** (medium/high のみ)
   - `<html>` 直下に `<style id="calm-screen-dark-force">` を 1 つだけ挿入。
   - 反転を打ち消す CSS:
     ```css
     img, video, picture, iframe, svg, canvas,
     [style*="background-image"] /* high のみ */ {
       filter: invert(1) hue-rotate(180deg) !important;
     }
     ```
   - これは `filter` プロパティを**画像系の子要素に**当てるだけで、`html` の合成 filter とは独立して効く (CSS filter は要素ごとに適用)。
   - `position: fixed` な暗い背景 (モーダルのオーバーレイ等) は v1 では扱わない (副作用が読みづらいため割り切り)。
3. **`color-scheme` の強制** (全強度)
   - `<style id="calm-screen-dark-force">` の冒頭に `html { color-scheme: dark !important; }` を入れる。
   - これでフォーム部品・スクロールバー・`<select>` ドロップダウン等の UA スタイルがダーク化する。low ではこれだけが効く。
   - 効果は副作用が小さいため、low/medium/high で常時 ON。

### 強度マップ
| intensity | color-scheme | filter 合成寄与               | 画像系再反転            |
|-----------|--------------|------------------------------|------------------------|
| low       | dark         | なし                          | なし                   |
| medium    | dark         | invert(1) hue-rotate(180deg)  | img/video/picture/iframe/svg/canvas |
| high      | dark         | invert(1) hue-rotate(180deg)  | medium + `[style*="background-image"]` |

### モジュール設計
- `src/features/dark-force.ts`
  - `export interface DarkForceParams { invert: boolean; reverseMedia: boolean; reverseBgImage: boolean }`
  - `export function paramsFor(intensity: Intensity): DarkForceParams`
  - `export function toFilterValue(p: DarkForceParams): string` → invert が true なら `"invert(1) hue-rotate(180deg)"`、そうでなければ `""`
  - `export function toCss(p: DarkForceParams): string` → `<style id="calm-screen-dark-force">` の中身 (color-scheme + 必要なら画像再反転)
  - `export function apply(doc: Document, p: DarkForceParams): void`
  - `export function remove(doc: Document): void`
  - 副作用は `apply`/`remove` のみに閉じ込め、純関数を分離してテスト容易性を確保する。
- `src/features/compose.ts` (T026 で更新)
  - dark-force の `toFilterValue` を合成末尾に追加。
- `src/content.ts` (T026 で更新)
  - `reconcile` 内で animation-mute と同様の独立分岐 `reconcileDarkForce(settings)` を追加し、`<style id="calm-screen-dark-force">` の挿入/削除 (color-scheme + 画像再反転) を司る。
  - filter 合成パスは `composeFilterValue` 経由で自動的に dark-force の `invert(...)` も含むようになる。

## 重ねがけ戦略 (blue-filter / desaturate / animation-mute との関係)
- **blue-filter / desaturate**: 単一 `filter` プロパティの取り合いになるため、必ず `composeFilterValue` 経由で空白区切り合成する。dark-force の invert は**最後**に積む (上記理由)。
- **animation-mute**: `<style>` ID と扱うプロパティ (`animation`/`transition`/`scroll-behavior`) が異なるため完全独立。dark-force の `<style id="calm-screen-dark-force">` とも干渉しない。
- 後続の [[brightness-cap]] とは `<style>` ID と狙うプロパティが異なる想定 (`opacity` ベースの黒オーバーレイ、または filter の `brightness(0.x)` 合成) なので独立に設計可能。brightness を合成 filter に含める場合は dark-force の **invert より前** に置く必要がある (invert 後の輝度低下は意図しない色になる)。順序規約: `blue-filter → desaturate → brightness-cap → dark-force(invert+hue-rotate)`。

## 設定との接続
- 読み取り: `loadSettings()` (`src/storage.ts`)
- 観測: `onSettingsChanged()` (`src/storage.ts`)
- `features.dark_force` と `intensity` の変化で再評価。
- 書き込み: ポップアップ/オプション側のみ。content からは書かない。

## エッジケース
- **すでにダークなサイト**: medium/high で反転するとライト化してしまう。v1 では自動検出せず、ユーザー側で機能を OFF にする想定。READMEで注記。
- **画像内に文字 (スクリーンショット, インフォグラフィック)**: 再反転で原色に戻すので白背景画像が眩しく残る。意図的トレードオフ。完全黒化は v2 候補。
- **動画**: 再反転で原色維持。ただし `<video>` 自体に CSS filter が適用されると GPU 合成負荷が増える。許容範囲。
- **`<iframe>`**: 外側の html invert は iframe 要素全体を反転する。中身の HTML には `all_frames: false` のため拡張が入らず、iframe 自体を再反転して中身が正常表示になる。意図された挙動。
- **PDF ビューア**: Chrome 内蔵 PDF は content_script 制限あり。v1 はベストエフォート。
- **CSS-in-JS の inline `background-image`**: high の `[style*="background-image"]` ヒューリスティクスでカバー。誤検出 (`background-image: none` も拾う) はあるが副作用 (再反転=元に戻る) は無視できる範囲。
- **CSP**: 厳格な `style-src 'self'` サイトでは `<style>` 注入が無視される可能性。合成 filter は `documentElement.style.setProperty("filter", combined, "important")` フォールバックで効く (compose 側で既に実装済み)。画像再反転と color-scheme は `<style>` が必要なため、CSP 下ではベストエフォートで諦める方針 (v1)。`adoptedStyleSheets` 試行も低優先度で検討。
- **OS `prefers-color-scheme: dark`**: 既にダーク設定のユーザーが拡張側でも force すると二重適用。color-scheme は冪等、filter invert は副作用 (元ダークがライト化) があるため、low を既定にすることで影響を抑える。検出して `dark_force` を auto-off にする UX は v1 非対応。
- **印刷プレビュー**: `@media print` 配下では合成 filter が一部効かないことがある。v1 では未対応。

## 想定リスク
- **「色がおかしい」報告**: invert + hue-rotate は色相がほぼ補正されるが、グラデーション・薄い影・半透明レイヤーは不自然になる。intensity = low を既定にして「フォーム部品だけダーク化」する穏当な挙動を最初に提示することで、ユーザーが段階的に強める導線を作る。
- **画像再反転の負荷**: 大量の `<img>` を持つページ (画像ギャラリー等) で GPU 合成負荷が上がる。低スペック PC では体感差あり。v1 では UX 説明のみで割り切り。
- **テスト**: 純関数 (`paramsFor`/`toFilterValue`/`toCss`) と副作用 (`apply`/`remove`) を vitest+jsdom で検証可能。Chrome API モックは本タスクでは不要。compose.ts への寄与は [[desaturate]] と同様の合成テスト ([blue-filter + dark-force] の filter 値が想定通りに space-join されること、順序が `blue-filter → desaturate → dark-force` であること) で担保する。

## 非対応 (v1 でやらないこと)
- サイト個別の auto-detect (既にダークなサイトでの自動 OFF)。
- ホワイトリスト/ブラックリスト。
- 反転以外の真のダークテーマ生成 (CSS 解析して暗色配色を生成する方式)。Premium 拡張候補。
- 印刷プレビューへの追従。
- `<iframe>` 内コンテンツへの注入 (`all_frames: true` 化)。
- 暗色オーバーレイ・グラデーション補正。

## 次タスク
- T026: `src/features/dark-force.ts` の実装、`src/features/compose.ts` への寄与追加 (invert を末尾に)、`src/content.ts` への分岐追加 (`<style id="calm-screen-dark-force">` の挿入/削除)。
- T027: 強度マップ / filter 文字列 / toCss / apply・remove / 合成パスでの順序 (`blue-filter → desaturate → dark-force`) を vitest+jsdom で担保。
