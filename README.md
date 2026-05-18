# やさしい画面 (calm-screen)

視覚過敏対応の Chrome 拡張 (MV3)。画面の色味・コントラスト・アニメーションを抑え、長時間作業時の眼精疲労を軽減します。

A Chrome MV3 extension for visual sensitivity. Softens color tone, reduces saturation, mutes animations, and forces dark mode to ease eye strain during long screen sessions.

---

## 機能一覧 / Features

| 機能 / Feature | 説明 / Description | プラン / Plan |
| --- | --- | --- |
| 青色光カット / Blue light filter | 暖色トーンへ調整 / Warm-tone adjustment | Free |
| 彩度抑制 / Desaturate | 鮮やかな色を落ち着いた色へ / Lower saturation | Free |
| アニメ抑制 / Animation mute | ページの動きを停止 / Pause page motion | Free |
| ダークモード強制 / Force dark | サイトを暗く反転 / Force dark on light sites | Free |
| 強度カスタマイズ / Intensity slider | 0–100% で調整 / Adjustable 0–100% | Free |
| 輝度上限 / Brightness cap | 最大輝度を制限 / Limit peak brightness | Premium |
| 7 日間トライアル / 7-day trial | 全 Premium 機能を試用 / Try all premium features | Premium |

---

## 使用例 / Usage

### 日本語

1. Chrome Web Store からインストール (申請準備中)、または `release/calm-screen.zip` を `chrome://extensions` の「パッケージ化されていない拡張機能を読み込む」で読み込み
2. ツールバーのアイコンをクリックしてポップアップを開く
3. 「有効」トグルで全体 ON/OFF、各機能のスイッチで個別に切替
4. 「強度」スライダーで効果の強さを調整
5. 詳細設定はオプションページ (右クリック → オプション) から

### English

1. Install from the Chrome Web Store (pending review) or load `release/calm-screen.zip` via `chrome://extensions` → "Load unpacked"
2. Click the toolbar icon to open the popup
3. Use the master toggle to enable/disable, then turn individual features on or off
4. Adjust the intensity slider to tune effect strength
5. Open the options page (right-click → Options) for advanced settings

---

## プライバシー / Privacy

- 設定は `chrome.storage` に保存され、端末外へ送信されません
- ネットワーク通信は Premium 決済 (Stripe Checkout 起動) のみ
- 詳細は `legal/PRIVACY.md`

Settings are stored in `chrome.storage` and never leave the device. The only outbound request is the Stripe Checkout redirect for Premium upgrade. See `legal/PRIVACY.md` for details.

---

## 開発 / Development

```bash
npm install
npm run dev       # vite dev build
npm run build     # production build → dist/
npm test          # vitest
npm run lint      # tsc --noEmit
npm run package   # build + zip → release/calm-screen.zip
```

---

## ライセンス / License

詳細は `legal/` を参照 / See `legal/` for license terms.
