# Design: blue-filter

視覚過敏向けの「青色光カット」機能。コンテンツスクリプトでページにフィルタを適用し、ブルーライトを抑えて温色寄りに見せる。

## 目的
- 長時間の画面利用による眼精疲労・睡眠リズム影響の低減を補助する。
- ハードウェア機能 (OS ナイトモード等) がない/使えない環境でも、ブラウザ単体で完結する手段を提供する。

## ユーザー体験
- ポップアップで `blue_filter` トグル ON/OFF。
- オプション画面の `intensity` (low/medium/high) を全機能共通で参照。
- マスタートグル `enabled=false` のときはすべての機能が即座に無効化される。

## アプローチ
1. **コンテンツスクリプト (`src/content.ts`)** が `document_start` で起動。
2. `<html>` 直下に `<style id="calm-screen-blue-filter">` を 1 つだけ挿入する。
3. CSS フィルタを `html` 要素に適用する:
   - `filter: sepia(<s>) hue-rotate(<h>deg) saturate(<sat>);`
   - sepia/hue-rotate で青チャネルを抑制し、暖色寄りにシフトさせる。
4. 強度マップ:
   | intensity | sepia | hue-rotate | saturate |
   |-----------|-------|------------|----------|
   | low       | 0.15  | -10deg     | 0.95     |
   | medium    | 0.30  | -15deg     | 0.90     |
   | high      | 0.50  | -25deg     | 0.85     |
5. 値は `src/features/blue-filter.ts` 内に定数として持ち、テストで参照可能にする。

## なぜ CSS フィルタか
- SVG `feColorMatrix` のほうが厳密だが、`<html>` への `filter` でも視覚目的としては十分。
- パフォーマンス: GPU 合成にのり、低スペック端末でも実用可。
- iframe へは `all_frames: false` の方針のため適用しない (Chrome Web Store ポリシーと最小権限のバランス)。
- 動画/画像は反転対象だが、明示的に「画像だけ素のまま」は v1 では対応しない (将来課題)。

## モジュール設計
- `src/features/blue-filter.ts`
  - `export interface BlueFilterParams { sepia: number; hueRotate: number; saturate: number; }`
  - `export function paramsFor(intensity: Intensity): BlueFilterParams`
  - `export function toCss(p: BlueFilterParams): string`
  - `export function apply(doc: Document, p: BlueFilterParams): void`
  - `export function remove(doc: Document): void`
  - 副作用は `apply`/`remove` のみに閉じ込め、純粋関数を分離してテスト容易性を確保する。
- `src/content.ts`
  - `loadSettings()` → 初期反映。
  - `onSettingsChanged` を購読し、`enabled` と `features.blue_filter` と `intensity` の変化で再評価。
  - 1 ティック以内に DOM 反映。Layout thrash 回避のため `requestAnimationFrame` でバッチ。

## 設定との接続
- 読み取り: `loadSettings()` (`src/storage.ts`)
- 観測: `onSettingsChanged()` (`src/storage.ts`)
- 書き込み: ポップアップ/オプション側のみ。content からは書かない。

## エッジケース
- **PDF ビューア**: Chrome 内蔵 PDF は content_script が制限あり。v1 はベストエフォート (適用されなくても致命的でない)。
- **`prefers-reduced-motion`/ダークモード**: filter は単独で動作。`dark_force` 機能 (T025) との共存は乗算可能 (CSS filter は重ねがけ OK)。
- **`<iframe>`**: `all_frames: false` のため未対応。クロスオリジン iframe には適用しない。
- **CSP**: `<style>` 注入は同一オリジン CSP の影響を受けにくいが、`style-src 'self'` 厳格サイトでは inline style がブロックされる可能性がある。その場合は `document.documentElement.style.filter = ...` で直接プロパティを設定するフォールバックを実装で用意する。

## 想定リスク
- **色覚補助系の拡張機能との衝突**: 同じく `html { filter: ... }` を当てると最後勝ちになる。マスタートグル OFF を案内できるよう README に注記する。
- **テスト**: DOM への副作用は jsdom 系の最小スタブで検証可能。Chrome API は本タスクではモック不要 (純関数のみテスト)。

## 非対応 (v1 でやらないこと)
- 画像/動画の補正除外。
- 時刻スケジューリング (日没自動 ON 等)。
- カスタム色温度スライダー (Premium 拡張候補)。

## 次タスク
- T017: `src/features/blue-filter.ts` と `src/content.ts` の最小実装。
- T018: 強度マップ・CSS 文字列・apply/remove の振る舞いを軽量テストで担保。
