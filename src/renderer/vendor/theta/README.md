# Theta Hatch のデザイン資産（取り込み）

このフォルダのファイルは `kiwiman0706-beep/Theta.Hatch.Series` から持ってきたものです。
**ここで編集しないでください。** 正本はシリーズ側です。

| ファイル | 正本 |
|---|---|
| `src/renderer/vendor/theta/theta-skins.css` | `design/skins/theta-skins.css`（`design/skins/skins.json` から `tools/gen_skins.py` が生成） |
| `assets/fonts/oswald_*.ttf`・`share_tech_mono.ttf` | `design/hud-kit/views/res/font/` |
| `assets/fonts/*-OFL.txt` | `design/hud-kit/licenses/`（SIL Open Font License） |

## 更新のしかた

シリーズ側でスキンが増えたり色が変わったら、上の表のとおり上書きコピーします。
取り込んだ時点: Theta.Hatch.Series 38f9d18 / スキン11種（system＋10）

## DeskHatch 側での使い方

`<html data-theta-skin="dark|light|pop|alert|scifi|term|braun|soft|window|lcd|system">`
を切り替えると配色が変わります。DeskHatch 固有の変数（`--teal` など）は
`styles.css` の「Theta skin bridge」で Hatch のトークンから導出しています。
