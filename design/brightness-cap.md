# Design: brightness-cap

視覚過敏・羞明 (photophobia) 向けの「輝度上限」機能。OS のディスプレイ輝度を最小まで下げても眩しさが残る環境 (屋外モバイル、自宅の蛍光灯下、夜間の暗い部屋で白背景を見るとき等) で、ブラウザ表示の明度を一段下げ、眼精疲労・頭痛・視覚的不快感を軽減する。

## 目的
- ハードウェアの最低輝度より暗い表示が必要な羞明傾向のユーザーに、ソフトウェア側で更にもう一段の減光を提供する。
- 不登校児・発達特性児が夜間や暗室で学習サイトを長時間閲覧するときの眼疲労を抑える。
- [[dark-force]] と異なり「色は維持したまま全体を均等に暗くする」ため、画像・動画・グラフ等の判読性を保ちたいユーザー向けの穏当な選択肢を提供する。
- Premium 機能 (`PREMIUM_FEATURES` に列挙) として位置付け、基本機能 (青色光カット/彩度抑制/アニメ抑制/ダーク強制) と差別化する。

## ユーザー体験
- ポップアップで `brightness_cap` トグル ON/OFF (Premium ゲートあり、未解放時はトグル無効化 + アップグレード導線)。
- オプション画面の `intensity` (low/medium/high) を全機能共通で参照。
  - low: 90% (`brightness(0.90)`) — ほぼ気付かない程度の控えめ減光。長時間用途の既定相当。
  - medium: 75% (`brightness(0.75)`) — 明確に暗くなる。白背景サイトでもチカチカが収まる。
  - high: 60% (`brightness(0.60)`) — 暗室向け。日中の屋外閲覧では文字が読みづらくなる可能性あり。
- マスタートグル `enabled=false` のときは即座に無効化される (`src/content.ts` の `reconcile` 経路に乗る)。
- 0% (完全黒) は v1 では出さない。意味がない上に「拡張のバグ」と誤認される事故が起こる。下限 0.60 を高 (high) 強度の下限として固定する。

## アプローチ
- `<html>` 要素に `filter: brightness(<b>)` を合成して適用する。
- [[blue-filter]] / [[desaturate]] / [[dark-force]] と同じ `filter` プロパティの取り合いになるため、必ず `src/features/compose.ts` の `composeFilterValue(settings)` 経由で空白区切り合成する。専用 `<style>` タグは持たない (filter 1 本に集約する方が後勝ち問題を回避できる)。
- 画像/動画への補正除外は v1 非対応 (`html` 全体に均等に効く、意図的)。
- `<style id="calm-screen-...">` 系の独立タグは不要なので、`reconcile` への追加分岐も不要。compose パスへの寄与追加だけで完結する。

### 強度マップ
| intensity | brightness |
|-----------|------------|
| low       | 0.90       |
| medium    | 0.75       |
| high      | 0.60       |

- 値は `src/features/brightness-cap.ts` 内に定数として持ち、テストで参照可能にする。
- 完全黒 (0) は v1 では出さない。下限 0.60。

### モジュール設計
- `src/features/brightness-cap.ts`
  - `export interface BrightnessCapParams { brightness: number }`
  - `export function paramsFor(intensity: Intensity): BrightnessCapParams`
  - `export function toFilterValue(p: BrightnessCapParams): string` → `"brightness(0.75)"` 形式 (合成パスから利用)
  - `export function toCss(p: BrightnessCapParams): string` → スタンドアロン使用時のフォールバック (`html{filter:brightness(...) !important}`)
  - `export function apply(doc: Document, p: BrightnessCapParams): void` (スタンドアロン適用、他機能と同型 API)
  - `export function remove(doc: Document): void`
  - 副作用は `apply`/`remove` のみに閉じ込め、純関数を分離してテスト容易性を確保する。
- `src/features/compose.ts` (T029 で更新)
  - `brightness-cap` の `toFilterValue` を **dark-force より前** に追加する。
  - 合成順序: `blue-filter → desaturate → brightness-cap → dark-force(invert+hue-rotate)`。
  - `settings.features.brightness_cap` が true でも Premium 未解放なら寄与しない (compose 側でゲート判定する、もしくは popup/options 側でそもそも true にできない UX にする — 後者を採用)。compose は単純に `features.brightness_cap` だけ見る。
- `src/content.ts` (T029)
  - 既存の compose パスを通すだけで自動的に反映される。追加分岐は不要。

## 重ねがけ戦略 (他フィルタとの関係)
- **blue-filter / desaturate**: 単一 `filter` プロパティの取り合い。compose 経由で空白区切り。順序は `blue-filter → desaturate → brightness-cap`。色温度補正 → 彩度抑制 → 輝度低下 の順は、彩度抑制で平坦化された色空間を最後に均等減光する素直な並び。
- **dark-force**: invert+hue-rotate は**必ず最後**。brightness を invert より後に置くと、反転後の色空間で輝度を下げることになり、ダーク化されたページ (元: 白背景) が更に黒寄りに沈み、文字が見えなくなる。brightness は invert の**前**に置くのが正しい (元の明度空間で減光してから反転 → 明部 → 暗部、暗部 → 明部 で結果として「暗いダーク」になる)。
- **animation-mute**: `<style>` ID と扱うプロパティ (`animation`/`transition`/`scroll-behavior`) が異なるため完全独立。
- まとめ: 合成順序は `blue-filter → desaturate → brightness-cap → dark-force(invert+hue-rotate)`。dark-force 設計書 (T025) で既に予告された順序規約に従う。

## 設定との接続
- 読み取り: `loadSettings()` (`src/storage.ts`)
- 観測: `onSettingsChanged()` (`src/storage.ts`)
- `features.brightness_cap` と `intensity` の変化で再評価。
- 書き込み: ポップアップ/オプション側のみ。content からは書かない。
- Premium ゲート: `PREMIUM_FEATURES` に `brightness_cap` が登録済み (`src/storage.ts`)。UI 側 (T032) で `isPremiumActive(settings)` が false のときトグルを disabled にし、Stripe Checkout 導線 (T033) を出す。compose ロジックは features フラグだけ見る (UI が gate するので二重ゲートにしない)。

## エッジケース
- **画像/動画への影響**: `html` に `filter:brightness` をかけると画像も均等に暗くなる。意図された挙動 (羞明対策として全体を暗くしたいので除外しない)。動画視聴中だけ OFF にしたい UX は v1 では出さず、ユーザー側でマスタートグルを切ってもらう。
- **PDF ビューア**: Chrome 内蔵 PDF は content_script 制限あり。v1 はベストエフォート。
- **`<iframe>`**: 外側 html の filter は iframe 要素全体を均等に暗くする。中身の HTML には注入されない (`all_frames: false`)。意図された挙動。
- **CSP**: `<style>` 注入が拒否されても、compose 側で `documentElement.style.setProperty("filter", combined, "important")` フォールバックが効くため動作する (blue-filter/desaturate と同戦略)。
- **dark-force との同時 ON**: 上記のとおり brightness を invert より**前**に置くことで意味のある結果になる。順序が逆だと「ダーク化されたページが更に暗黒化」する事故になるので、compose 側のテストで順序を担保する。
- **印刷プレビュー**: `@media print` 配下では合成 filter が一部効かない。v1 では未対応。
- **OS 側ナイトモード/Night Shift**: 二重適用で意図より暗くなる。検出は不可能なので README で注記。

## 想定リスク
- **「暗すぎて読めない」報告**: high (0.60) で日中屋外利用すると文字が読みづらくなる。既定強度は medium、UI で「夜間/暗室向け」ヒントを表示することで誤用を抑える。
- **アクセシビリティの罠**: WCAG コントラスト基準を満たしていたサイトでも、`brightness(0.6)` をかけると実効コントラスト比が下がる。「視覚過敏ユーザー自身が選んで使う」前提なので許容するが、UI 文言で副作用を明示。
- **他フィルタ系拡張との衝突**: 同じく `html { filter: ... }` を当てる拡張があると後勝ち。README に注記。
- **Premium ゲートの抜け道**: features フラグだけで compose していると、ユーザーが DevTools で `chrome.storage.local.set({features:{brightness_cap:true}})` を叩けば動く。v1 では「設定 UI が brightness_cap への変更を premium 判定で蓋する」軽量ゲートで充分とする (悪意ある回避は禁止しないが、誤購入回避は十分)。

## テスト
- 純関数 (`paramsFor` / `toFilterValue` / `toCss`) を vitest+jsdom で網羅:
  - low/medium/high で brightness 値が 0.90 / 0.75 / 0.60 になること。
  - `toFilterValue` が `"brightness(<n>)"` 形式の文字列を返すこと。
  - `toCss` が `html{filter:brightness(<n>) !important}` を返すこと。
- 副作用 (`apply` / `remove`):
  - `<style id="calm-screen-brightness-cap">` の挿入/削除と冪等性。
  - apply 二度がけで重複しないこと。
  - 強度切替で `textContent` が更新されること。
- compose 統合:
  - `blue-filter + brightness-cap` の space-join 順が `blue-filter → brightness-cap`。
  - `brightness-cap + dark-force(medium)` の順が `brightness-cap → invert(1) hue-rotate(180deg)`。
  - `blue-filter + desaturate + brightness-cap + dark-force` の全部入りで `blue-filter → desaturate → brightness-cap → dark-force(invert)` 順であること。
  - features.brightness_cap=false なら寄与しないこと。
- Chrome API モックは本タスクでは不要。

## 非対応 (v1 でやらないこと)
- 画像/動画/特定セレクタの除外 (一律均等減光)。
- 完全黒 (brightness 0)。
- 時刻トリガ自動オン/オフ (例: 日没後だけ ON)。Premium 拡張候補。
- 環境光センサー連動 (Chrome 拡張からは取れない API)。
- サイト個別の強度上書き。

## 次タスク
- T029: `src/features/brightness-cap.ts` の実装、`src/features/compose.ts` への寄与追加 (brightness を dark-force の invert より前に挿入)。`src/content.ts` への追加分岐は不要 (compose 経由で吸収)。
- T030: 強度マップ / filter 文字列 / toCss / apply・remove / 合成パスでの順序 (`blue-filter → desaturate → brightness-cap → dark-force`) を vitest+jsdom で担保。
