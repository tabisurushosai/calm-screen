# Design: desaturate

視覚過敏向けの「彩度抑制」機能。コンテンツスクリプトでページ全体の彩度を下げ、原色のチカチカや色刺激を緩和する。

## 目的
- 高彩度の広告・SNS・ゲーム UI 等による色刺激を低減し、長時間閲覧時の疲労感を抑える。
- 色覚特性のあるユーザーが、強い赤・青・緑の競合で文字を見失わないよう、コントラスト中心の見え方に寄せる。
- OS レベルのグレースケール設定が使えない/全アプリに効いてしまう環境で、ブラウザ単位の中間的な選択肢を提供する。

## ユーザー体験
- ポップアップで `desaturate` トグル ON/OFF。
- オプション画面の `intensity` (low/medium/high) を全機能共通で参照。
- マスタートグル `enabled=false` のときは即座に無効化される (`src/content.ts` の `reconcile` 経路に乗る)。
- 完全モノクロ (saturate(0)) は v1 では出さない。「読みやすい範囲」のみを既定とし、ユーザーがびっくりしないようにする。

## アプローチ
1. **コンテンツスクリプト (`src/content.ts`)** が `document_start` で起動 (既存)。
2. `<html>` 直下に `<style id="calm-screen-desaturate">` を 1 つだけ挿入する。
3. CSS フィルタを `html` 要素に適用する:
   - `filter: saturate(<sat>);`
   - blue-filter と独立した `<style>` タグにすることで、CSS の最後勝ち問題を避けつつ、互いに重ねがけできる (CSS filter プロパティは単一プロパティなので「両方を 1 つの filter 値に結合」する責務は `content.ts` のコンポーザに持たせる、後述)。
4. 強度マップ:
   | intensity | saturate |
   |-----------|----------|
   | low       | 0.80     |
   | medium    | 0.60     |
   | high      | 0.40     |
   - high でも 0.40 を下限とする (完全モノクロは v1 では出さない方針)。
5. 値は `src/features/desaturate.ts` 内に定数として持ち、テストで参照可能にする。

## 重ねがけ戦略 (重要: blue-filter との干渉)
- CSS の `filter` プロパティは要素に 1 つしか効かない。`html` に対して 2 つの `<style>` から `filter:...` を当てると、後勝ちで一方が消える。
- 解決策: **content.ts に「アクティブな filter を文字列として合成する責務」を集約する**。
  - 各機能モジュールは「自分が有効なら返す filter 部分文字列」を提供する純関数を export する (例: `desaturate.filterPart(intensity)` → `"saturate(0.6)"`)。
  - `content.ts` は有効な機能の部分文字列を space-join し、`html { filter: <combined> !important }` を 1 つの `<style id="calm-screen-filter">` に書き込む。
  - これにより blue-filter と desaturate が共存し、両方の効果が累積する。
- ただし T019 は設計のみ。**実装移行は T020 で行う**。T020 で blue-filter 側も「合成パス」に統合する小規模リファクタが入る (apply/remove API は後方互換のため残してよいが、`content.ts` は新しい合成ヘルパを使う)。

## モジュール設計
- `src/features/desaturate.ts`
  - `export interface DesaturateParams { saturate: number }`
  - `export function paramsFor(intensity: Intensity): DesaturateParams`
  - `export function toFilterValue(p: DesaturateParams): string` → `"saturate(0.6)"` 形式 (合成パスから利用)
  - `export function toCss(p: DesaturateParams): string` → スタンドアロン使用時のフォールバック (`html{filter:saturate(...) !important}`)
  - `export function apply(doc: Document, p: DesaturateParams): void` (スタンドアロン適用、blue-filter と同型 API)
  - `export function remove(doc: Document): void`
  - 副作用は `apply`/`remove` のみに閉じ込め、純関数を分離してテスト容易性を確保する。
- `src/content.ts` (T020 で更新)
  - `composeFilterCss(settings)` を新設し、有効な機能の `toFilterValue` を space-join。
  - 既存の `applyBlueFilter` / `removeBlueFilter` ベタ呼び出しは合成パスへ置き換え。

## 設定との接続
- 読み取り: `loadSettings()` (`src/storage.ts`)
- 観測: `onSettingsChanged()` (`src/storage.ts`)
- `features.desaturate` と `intensity` の変化で再評価。
- 書き込み: ポップアップ/オプション側のみ。content からは書かない。

## エッジケース
- **画像/動画への影響**: `html` に `filter` をかけると画像も彩度低下する。意図された挙動だが、写真ビューア等で困る場合は将来の除外設定で対応 (v1 非対応)。
- **PDF ビューア**: Chrome 内蔵 PDF は content_script 制限あり。v1 はベストエフォート。
- **`<iframe>`**: `all_frames: false` のため未対応。
- **CSP**: 厳格な `style-src 'self'` サイトでは `<style>` 注入が無視される可能性。フォールバックとして `documentElement.style.setProperty("filter", combined, "important")` を併用する (blue-filter と同じ戦略)。
- **dark_force との共存** (T025): `filter` ではなく `color-scheme`/CSS 変数で実装される想定なので独立。

## 想定リスク
- **他フィルタ系拡張との衝突**: 同じく `html { filter: ... }` を当てる拡張があると最後勝ち。README に注記。
- **アクセシビリティの罠**: saturate を下げすぎると、色のみで情報を伝える UI (信号色のエラーバッジ等) が判読しにくくなる。high でも 0.40 を下限にし、完全モノクロは出さない方針で軽減。
- **テスト**: 純関数 (`paramsFor`/`toFilterValue`/`toCss`) と副作用 (`apply`/`remove`) を vitest+jsdom で検証可能。Chrome API モックは本タスクでは不要。

## 非対応 (v1 でやらないこと)
- 完全モノクロ (saturate(0))。Premium 拡張候補。
- 画像/動画の補正除外。
- ホワイトリスト/ブラックリスト (サイトごとに OFF)。
- 色覚タイプ別のカスタムマトリックス。

## 次タスク
- T020: `src/features/desaturate.ts` の実装、および `src/content.ts` の合成パス導入 (blue-filter と共存)。
- T021: 強度マップ / filter 文字列 / apply・remove / 合成パスでの累積適用 を vitest で担保。
