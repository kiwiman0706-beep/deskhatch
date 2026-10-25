# Home.Hatch のデザインを DeskHatch に移植する

> `Theta.Home.Hatch` の `app/src/main/java/jp/yaegaki/theta/home/ui/Theme.kt` から
> 書き写した定義。xxx.Hatch 全体で見た目を揃えるための参照元。
> **Home.Hatch 側が変わったらこちらも更新すること**（手で写しているので自動では追随しない）。

## テーマは3つ

| | 性格 |
|---|---|
| **DARK** | 計器盤（HUD）風。黒地にオレンジ1色、細い線、**四角い角**（左上を落とした面取り） |
| **LIGHT** | 紙のような地に墨色。オレンジは文字にも使えるよう濃いめ |
| **POP** | クリームの地にコーラル・イエロー・ミントの3色。**角丸・太い線・影**、ゴシック体 |

Home.Hatch にはこれに「端末に合わせる」があるが、これはテーマではなく
DARK/LIGHT を OS 設定で選ぶだけなので、デザインは3つ。

## パレット

```css
/* DARK — 黒地にオレンジ1色 */
--bg:      #0A0A0B;   --panel:  #111113;   --raised: #19191C;
--fg:      #EDEDED;   --muted:  #A3A3A3;   --faint:  #858585;
--line:    #333336;
--accent:  #FF6B1A;   --on-accent: #0A0A0B;
--widget:  #EDEDED;   --launch: #7A7A7E;
--zebra:   rgba(255,255,255,.059);

/* LIGHT — 紙の地に墨 */
--bg:      #F4F3EE;   --panel:  #FFFFFF;   --raised: #E9E8E2;
--fg:      #121212;   --muted:  #474747;   --faint:  #5E5E5E;
--line:    #BDBCB4;
--accent:  #B8400C;   --on-accent: #FFFFFF;
--widget:  #121212;   --launch: #6A6A6A;
--zebra:   rgba(0,0,0,.051);

/* POP — クリームにコーラル／イエロー／ミント */
--bg:      #FAF6EC;   --panel:  #FFFFFF;   --raised: #F2EDE0;
--fg:      #2B2B2B;   --muted:  #4F4F4F;   --faint:  #6B6B6B;
--line:    #2B2B2B;                        /* 線が文字色と同じ＝太く強い輪郭 */
--accent:  #EF6F51;   --on-accent: #FFFFFF;   /* コーラル */
--accent2: #F5C842;                           /* イエロー */
--accent3: #A8E2CF;                           /* ミント */
--widget:  #7FCFB5;   --launch: #F2BE2E;
--zebra:   rgba(245,200,66,.149);
```

### 色の役割

`accent` / `widget` / `launch` は**タブの系統を見分けるための3色**。
Home.Hatch では `group(0)=accent`（フォルダ）、`group(1)=widget`（ウィジェット）、
`group(2)=launch`（起動）。DeskHatch なら「Webページ系」「ローカルアプリ系」
「ツール系」のような対応になる。

POP ではこれが**コーラル／ミント／イエロー**になり、はっきり色分けされる。
DARK/LIGHT では**オレンジ／白（墨）／灰**なので、彩度ではなく明度で分かれる。

## 形と線

| | DARK / LIGHT | POP |
|---|---|---|
| 角 | **面取り**（左上を落とす。角丸ではない） | `border-radius: 8px`（ボタン） / `10px`（面） |
| 線の太さ | `1px` | `1.5px` |
| 影 | なし | **右下に 3px ずらした、`--fg` 色のベタ影**（ぼかさない） |

POP の影はぼかし無しの単色オフセットで、いわゆるネオブルータリズム的な見た目。
CSS では `box-shadow: 3px 3px 0 var(--fg);`。

## 書体

| 用途 | DARK / LIGHT | POP |
|---|---|---|
| 見出し・時計 | **Oswald**（細長い） | 端末のゴシック（太め） |
| ラベル・数字・ファイル名 | **Share Tech Mono**（等幅） | 端末のゴシック |
| 日本語 | 端末の書体 | 端末の書体 |

Oswald と Share Tech Mono はどちらも **SIL Open Font License**。
Home.Hatch は同梱している（`docs/licenses`）。DeskHatch で使うなら同様に同梱し、
ライセンス表記を持ってくること。**日本語は両方ともカバーしないので、
和文は OS の既定書体に落ちる**前提の設計。

## DeskHatch へ移すときの注意

- 既存テーマ（Teal / Graphite / クラシックMac / Win95 / XP …）は**残す**。
  Home.Hatch 由来の3つを**追加**する形にする。歴代OSオマージュのテーマ群は
  DeskHatch 固有の資産で、捨てる理由がない
- 縦タブのラベルは**横書きを90度回転**（`transform: rotate(90deg)` か
  `writing-mode: sideways-rl`）。`writing-mode: vertical-rl` は**日本語の縦書き**に
  なってしまい別物
- POP の面取り（DARK/LIGHT 側）は CSS では `clip-path` で作る:
  `clip-path: polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px);`

## 出典

`Theta.Home.Hatch` v0.23.0-alpha 時点:
- `app/src/main/java/jp/yaegaki/theta/home/ui/Theme.kt` — パレット・形・書体
- `README.md` —「見た目」節
