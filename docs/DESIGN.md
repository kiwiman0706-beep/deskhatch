# 見た目：Theta Hatch のスキン

DeskHatch の配色は **Theta Hatch シリーズのスキン**を使います。
独自テーマは廃止しました。Home.Hatch で選んだスキンと同じものが DeskHatch にも効きます。

## 正本はシリーズ側

色の値も形（角丸・線の太さ・影）も、このリポジトリでは**決めません**。

| | 場所 |
|---|---|
| **正本** | `kiwiman0706-beep/Theta.Hatch.Series` の `design/skins/skins.json` |
| 生成されたCSS | 同 `design/skins/theta-skins.css`（`tools/gen_skins.py` が生成） |
| フォント | 同 `design/hud-kit/views/res/font/`（SIL OFL） |
| 取り込み先 | `src/renderer/vendor/theta/`・`assets/fonts/`（[README](../src/renderer/vendor/theta/README.md)） |

シリーズ側でスキンが増えたら、上書きコピーするだけです。
**手で色を書き写さないこと。** 以前それをして、5スキンのまま古くなりました。

## スキン一覧（11種）

`system`（端末のダーク／ライトに追従・既定）/ `dark` / `light` / `pop` /
`alert` / `scifi` / `term` / `braun` / `soft` / `window` / `lcd`

切り替えは ☰ → 設定 → **スキン**。内部的には `<html data-theta-skin="...">` を変えるだけです。

## DeskHatch 側の作り

`styles.css` 末尾の **「Theta skin bridge」** が、Hatch のトークンから
DeskHatch 固有の変数を導出しています。

| Hatch のトークン | 役割 | DeskHatch での使われ方 |
|---|---|---|
| `--panel` | chrome 面 | バー本体、入力欄、ボタン |
| `--bg` | 地の面 | ドロワーの本文（`--paper`） |
| `--raised` | 持ち上がった面 | ドロワーの見出し、ツールバー、右トレイ |
| `--accent` | 主色 | アクティブなタブ、選択 |
| `--line` | 罫 | すべての境界線 |
| `--fg` / `--muted` / `--faint` | 文字 | 本文 / 副次 / 補助 |
| `--radius` / `--line-width` / `--shadow` | 形 | ドロワーの角・線・影 |

**色を直接書かないこと。** 役割から取ります。
以前は `#fff`・`#cfdcdc` といった直書きが188箇所あり、暗いスキンで文字が読めませんでした。

## 残っている直書き

意図のあるものだけ残しています。

- **電卓** — iPhone 風の黒地／オレンジ。スキンに追従しません
- **マージ中のハイライト**（`#ffd86b`）、**エラーの赤**（`#c0392b`） — 状態を示す色
- 絵文字アイコン — 文字なので色は持ちません

気になったらトークン化してください。
