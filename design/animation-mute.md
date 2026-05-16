# Design: animation-mute

視覚過敏・前庭系過敏向けの「アニメーション抑制」機能。コンテンツスクリプトでページ全体の CSS アニメーション/トランジション/スムーズスクロールを無効化し、動きによる刺激や乗り物酔い様の不快感を軽減する。

## 目的
- 自動再生カルーセル、パララックス、巨大な fade/slide、絶え間ない loading spinner 等による動きの刺激を抑え、注意散漫・乗り物酔い症状・視覚疲労を軽減する。
- 前庭系過敏 (vestibular disorder) や ADHD/ASD 傾向のユーザーにとって、OS の `prefers-reduced-motion` が効かないサイトでも一律に静止に近づける。
- 不登校児・発達特性児が学習サイトを開いたとき、装飾モーションに気を取られず本文に集中できるようにする。

## ユーザー体験
- ポップアップで `animation_mute` トグル ON/OFF。
- オプション画面の `intensity` (low/medium/high) を全機能共通で参照。
  - low: 派手な動きだけ短縮 (transition は残す)。
  - medium: アニメーション/トランジションをほぼ瞬間化 (1ms)。スムーズスクロール無効。
  - high: medium に加えて `<video>`/`<img>` の autoplay 抑制、`scroll-behavior: auto !important` を強制し、`will-change`/`transform` 由来のアイドル合成負荷も最小化する CSS を追加。
- マスタートグル `enabled=false` のときは即座に無効化される (`src/content.ts` の `reconcile` 経路に乗る)。
- 動画の再生自体は止めない (UX 上クリック再生の阻害になる)。あくまで「自動で動くもの」を止める方針。

## アプローチ
1. **コンテンツスクリプト (`src/content.ts`)** が `document_start` で起動 (既存)。
2. `<html>` 直下に `<style id="calm-screen-animation-mute">` を 1 つだけ挿入する (blue-filter/desaturate の合成 `filter` パスとは別系統)。
3. CSS ルールで以下を強制する:
   ```css
   *, *::before, *::after {
     animation-duration: <dur> !important;
     animation-delay: 0s !important;
     animation-iteration-count: 1 !important;
     transition-duration: <dur> !important;
     transition-delay: 0s !important;
   }
   html { scroll-behavior: auto !important; }
   ```
   - high のときは追加で:
   ```css
   video[autoplay] { /* JS から pause、後述 */ }
   *, *::before, *::after { will-change: auto !important; }
   ```
4. 強度マップ:
   | intensity | duration | scroll-behavior | autoplay 停止 |
   |-----------|----------|-----------------|---------------|
   | low       | 200ms    | auto            | しない        |
   | medium    | 1ms      | auto            | しない        |
   | high      | 1ms      | auto            | する          |
   - low は「ゼロにしない」ことで、ボタンの押下フィードバック等の最低限のアフォーダンスを残す。
5. 値は `src/features/animation-mute.ts` 内に定数として持ち、テストで参照可能にする。
6. autoplay 停止 (high のみ):
   - `MutationObserver` で `<video autoplay>`/`<audio autoplay>` を検出し、`pause()` を呼ぶ。
   - 1 度きりの介入とし、ユーザーが手動で再生ボタンを押した後は干渉しない (`muted` 化や `removeAttribute("autoplay")` で再 mutation を起こさない)。
   - GIF/Lottie は CSS では止められないため v1 非対応 (将来課題)。

## 重ねがけ戦略 (blue-filter / desaturate との関係)
- animation-mute は **CSS の `animation` / `transition` / `scroll-behavior` プロパティ**を扱い、`filter` には触れない。
- そのため [[desaturate]] の `composeFilterValue` パスと**完全に独立**で、合成衝突は発生しない。
- `src/content.ts` の `reconcile` 内で、合成 filter の適用とは別系統で `applyAnimationMute` / `removeAnimationMute` を呼ぶ構成を取る。
- 後続の [[dark-force]] / [[brightness-cap]] とも `<style>` ID が異なるため独立。

## モジュール設計
- `src/features/animation-mute.ts`
  - `export interface AnimationMuteParams { duration: string; killAutoplay: boolean }`
  - `export function paramsFor(intensity: Intensity): AnimationMuteParams`
  - `export function toCss(p: AnimationMuteParams): string` → スタイルタグ用 CSS 文字列
  - `export function apply(doc: Document, p: AnimationMuteParams): void` (副作用: `<style>` 挿入 + 必要なら autoplay 停止フック設置)
  - `export function remove(doc: Document): void` (副作用解除、MutationObserver 切断)
  - 副作用は `apply`/`remove` のみに閉じ込め、純関数を分離してテスト容易性を確保する。
- `src/content.ts` (T023 で更新)
  - 既存の合成 filter 反映に加えて、`settings.enabled && settings.features.animation_mute` を見て `apply`/`remove` を呼ぶ分岐を追加する。
  - rAF バッチ済みの `reconcile` から呼ぶことで、blue-filter/desaturate と同じタイミングで反映される。

## 設定との接続
- 読み取り: `loadSettings()` (`src/storage.ts`)
- 観測: `onSettingsChanged()` (`src/storage.ts`)
- `features.animation_mute` と `intensity` の変化で再評価。
- 書き込み: ポップアップ/オプション側のみ。content からは書かない。

## エッジケース
- **ユーザーアニメーションへの過剰介入**: フォームバリデーション失敗時の shake 等、UX 上意味のあるアニメも止まる。v1 では割り切り (low なら 200ms 残るので軽減)。
- **`<canvas>`/WebGL アニメ**: CSS では止められない。v1 非対応。
- **JS による `requestAnimationFrame` 連続描画**: 同上。v1 非対応。
- **CSS-in-JS の inline animation**: `!important` で勝てる範囲のみ。`element.animate()` (Web Animations API) はインスタンス側で `playbackRate=0` などの介入が必要で、v1 非対応。
- **PDF ビューア / `<iframe>`**: 既存機能と同じく適用外。
- **CSP**: 厳格な `style-src 'self'` サイトでは `<style>` 注入が無視される可能性。フォールバックとして `documentElement.style.setProperty(...)` は使えない (アニメ系プロパティは個別要素ごとに効くため `html` 1 要素には載らない)。代わりに `adoptedStyleSheets` を試し、それも失敗したらベストエフォートで諦める方針 (v1 はベストエフォート明記)。
- **OS `prefers-reduced-motion`**: 既に reduced を選んでいるユーザーが拡張側でも mute すると二重適用になるが、副作用は「より静止する」だけで害は小さい。検出して off る挙動は v1 では実装しない。

## 想定リスク
- **「動かないと壊れて見える」UI**: Material 系の Ripple や Tab indicator の transition が消えると、状態変化に気づきにくくなる。low 強度を既定にし、ユーザーが必要に応じて medium/high を選ぶ建付け。
- **autoplay 停止の副作用 (high)**: 動画広告以外に、UX 上意味のある背景動画 (ヒーローセクション) も止まる。high を選んだユーザーは承知の上、と割り切る。
- **テスト**: 純関数 (`paramsFor`/`toCss`) と副作用 (`apply`/`remove`, MutationObserver の挙動) を vitest+jsdom で検証可能。Chrome API モックは不要。autoplay 停止のテストでは jsdom に `HTMLMediaElement.prototype.pause` のスタブを置く。

## 非対応 (v1 でやらないこと)
- GIF / APNG / Lottie / `<canvas>` / WebGL の停止。
- Web Animations API (`element.animate()`) インスタンスへの介入。
- スクロールジャック (`scrolljs`/`fullPage.js` 等) の検出と無効化。
- サイトごとの whitelist / blacklist。

## 次タスク
- T023: `src/features/animation-mute.ts` の実装、`src/content.ts` への分岐追加 (合成 filter とは独立した第 2 系統)。
- T024: 強度マップ / CSS 文字列 / apply・remove / autoplay 停止 を vitest+jsdom で担保。
