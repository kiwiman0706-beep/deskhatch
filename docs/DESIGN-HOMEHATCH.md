# Home.Hatch のデザインを DeskHatch に移植する

> `Theta.Home.Hatch` **v0.25.0-alpha**（`8be1fb1`）の
> `app/src/main/java/jp/yaegaki/theta/home/ui/Theme.kt` から書き写した定義。
> xxx.Hatch 全体で見た目を揃えるための参照元。
> **Home.Hatch 側が変わったらこちらも更新すること**（手で写しているので自動では追随しない）。

## テーマは5つ

| | 地 | アクセント3色 | 性格 |
|---|---|---|---|
| **DARK** | 黒 `#0A0A0B` | オレンジ／白／灰 | 計器盤（HUD）風。細い線、**面取り**の角 |
| **LIGHT** | 紙 `#F4F3EE` | 濃オレンジ／墨／灰 | 同じ計器盤を明るい地で |
| **POP** | クリーム `#FAF6EC` | コーラル／ミント／イエロー | **角丸・太線・ベタ影**、ゴシック体。別人格 |
| **ALERT** | ほぼ黒 `#050404` | 橙／赤／緑 | 特務機関の警報画面ふう。**走査線**＋太い警告帯 |
| **SCI-FI** | 暗い青緑 `#060C0E` | 黄／水色／緑 | 宇宙船の操作卓ふう。**方眼**の背景 |

「端末に合わせる」(`system`) はテーマではなく DARK/LIGHT を OS 設定で選ぶだけ。

### 3色が担う役割

`accent` / `widget` / `launch` は**タブの系統を見分ける3色**。
Home.Hatch では `group(0)=accent`（フォルダ）、`group(1)=widget`（ウィジェット・予定）、
`group(2)=launch`（起動）。DeskHatch なら「Webページ系／ローカルアプリ系／ツール系」が対応する。

DARK・LIGHT は彩度ではなく**明度**で分ける（オレンジ／白・墨／灰）。
POP・ALERT・SCI-FI は**はっきり色で**分ける。

## パレット

```css
/* DARK — 黒地にオレンジ1色 */
--bg:#0A0A0B; --panel:#111113; --raised:#19191C;
--fg:#EDEDED; --muted:#A3A3A3; --faint:#858585; --line:#333336;
--accent:#FF6B1A; --on-accent:#0A0A0B; --widget:#EDEDED; --launch:#7A7A7E;
--zebra:rgba(255,255,255,.059);

/* LIGHT — 紙の地に墨 */
--bg:#F4F3EE; --panel:#FFFFFF; --raised:#E9E8E2;
--fg:#121212; --muted:#474747; --faint:#5E5E5E; --line:#BDBCB4;
--accent:#B8400C; --on-accent:#FFFFFF; --widget:#121212; --launch:#6A6A6A;
--zebra:rgba(0,0,0,.051);

/* POP — クリームにコーラル／ミント／イエロー */
--bg:#FAF6EC; --panel:#FFFFFF; --raised:#F2EDE0;
--fg:#2B2B2B; --muted:#4F4F4F; --faint:#6B6B6B; --line:#2B2B2B;  /* 線＝文字色。太く強い輪郭 */
--accent:#EF6F51; --on-accent:#FFFFFF; --widget:#7FCFB5; --launch:#F2BE2E;
--accent2:#F5C842; --accent3:#A8E2CF;
--zebra:rgba(245,200,66,.149);

/* ALERT — 警報画面。橙の文字、警告の赤、正常の緑 */
--bg:#050404; --panel:#0D0908; --raised:#1A110C;
--fg:#FFD9B0; --muted:#D6955C; --faint:#9C6A42; --line:#5C3418;
--accent:#FF7A00; --on-accent:#050404; --widget:#FF2A2A; --launch:#39E07A;
--accent2:#FF2A2A; --accent3:#39E07A;
--zebra:rgba(255,122,0,.078);
--backdrop:scan; --hazard:10px;

/* SCI-FI — 操作卓。黄／水色／緑 */
--bg:#060C0E; --panel:#0B1519; --raised:#112128;
--fg:#DDF6FF; --muted:#8FB8C4; --faint:#5F8794; --line:#1F3C46;
--accent:#F2E21B; --on-accent:#060C0E; --widget:#3FD0E8; --launch:#7BE38B;
--accent2:#3FD0E8; --accent3:#7BE38B;
--zebra:rgba(63,208,232,.071);
--backdrop:grid; --hazard:6px;
```

## 形・線・影

| | DARK / LIGHT / ALERT / SCI-FI | POP |
|---|---|---|
| 角 | **面取り**（左上を落とす。角丸ではない） | `border-radius` 8px（ボタン）/ 10px（面） |
| 線 | 1px | 1.5px |
| 影 | なし | **右下 3px のベタ影**（ぼかさない、色は `--fg`） |

POP の影は CSS だと `box-shadow: 3px 3px 0 var(--fg);`。
面取りは `clip-path: polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px);`。

## 背景の模様（ALERT / SCI-FI のみ）

```css
/* scan（ALERT）— 4px ごとの横線、accent を 5% で */
background-image: repeating-linear-gradient(
  to bottom,
  color-mix(in srgb, var(--accent) 5%, transparent) 0 1px,
  transparent 1px 4px);

/* grid（SCI-FI）— 28px の方眼、widget を 7% で */
background-image:
  repeating-linear-gradient(to right,
    color-mix(in srgb, var(--widget) 7%, transparent) 0 1px, transparent 1px 28px),
  repeating-linear-gradient(to bottom,
    color-mix(in srgb, var(--widget) 7%, transparent) 0 1px, transparent 1px 28px);
```

## 警告帯（hazard）

ドロワーの見出しの**上**に、斜めの縞を引いた帯。**太さがテーマごとに違う**
（既定 4px、ALERT 10px、SCI-FI 6px）。色はそのタブの系統色（`group(g)`）。

縞の描き方（`Stripes`）: 間隔 7px、線幅は間隔の 45%、**左下から右上への45度**。

```css
.hazard {
  height: var(--hazard, 4px);
  background-image: repeating-linear-gradient(45deg,
    var(--group) 0 3.15px, transparent 3.15px 7px);
}
```

## 書体

| 用途 | POP 以外 | POP |
|---|---|---|
| 見出し・時計 | **Oswald**（細長い） | 端末のゴシック（太め） |
| ラベル・数字・ファイル名 | **Share Tech Mono**（等幅） | 端末のゴシック |
| 日本語 | 端末の書体 | 端末の書体 |

Oswald と Share Tech Mono はどちらも **SIL Open Font License**。Home.Hatch は同梱
（`docs/licenses`）。DeskHatch で使うなら同様に同梱し、ライセンス表記も持ってくること。
**どちらも和文をカバーしないので、日本語は OS の既定書体に落ちる**前提の設計。

小さなラベルは `letter-spacing: 1px` 相当を入れている（`Readout`）。

## DeskHatch へ移すときの注意

- 既存テーマ（Teal / Graphite / クラシックMac / Win95 / XP / Vista / iMac G3 / VAIO /
  PC-98 / Amiga / Game Boy / SmartCenter …）は**残して、この5つを追加**する。
  歴代OSオマージュ群は DeskHatch 固有の資産で、捨てる理由がない
- 縦タブのラベルは**横書きを90度回転**（`transform: rotate(90deg)` か
  `writing-mode: sideways-rl`）。`writing-mode: vertical-rl` は**日本語の縦書き**に
  なってしまい別物
- `--backdrop` と `--hazard` は DeskHatch の既存テーマには無い概念。
  既定を「模様なし・4px」にしておけば、既存テーマは何も変えずに済む

## 出典

`Theta.Home.Hatch` v0.25.0-alpha（`8be1fb1`）:
- `app/src/main/java/jp/yaegaki/theta/home/ui/Theme.kt` — パレット・模様・形・書体
- `app/src/main/java/jp/yaegaki/theta/home/ui/Bits.kt` — `Stripes`（警告帯）・`Readout`
- `app/src/main/java/jp/yaegaki/theta/home/ui/Drawers.kt` — 見出し上の帯の使い方
- `README.md` —「見た目」節
