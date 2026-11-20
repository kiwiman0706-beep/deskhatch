# 既知の問題

## macOS: Intel Mac で RTSP カメラが動かない

**症状**: Intel（x86_64）の Mac でカメラドロワーを開いても映像が出ない。
Apple Silicon では正常。

**原因**: `ffmpeg-static` は npm install を**実行したマシンのアーキテクチャ**向けの
バイナリを1つだけ取得する。リリースをビルドする GitHub の macOS ランナーは
Apple Silicon なので、universal アプリの x64 スライスにも **arm64 の ffmpeg** が
同梱されてしまう。Intel Mac ではこれが実行できない。

**いつからか**: universal ビルドを始めた時から。公開済みの `v0.1.72-beta.2` を
実際に展開して確認済み（`single-arch Mach-O: arm64`）。電子ビルダー 24 が使っていた
`@electron/universal` はこれを黙って通していたため、誰も気づかなかった。

electron-builder 26 の `@electron/universal` は、x64 側と arm64 側で**同一の
Mach-O** を見つけると merge を拒否するようになった。そのため
`package.json` の `mac.x64ArchFiles` でこのファイルを明示的に宣言している:

```json
"x64ArchFiles": "**/app.asar.unpacked/**"
```

同じ理由で `koffi` のプリビルド（`darwin_arm64/koffi.node`・`darwin_x64/koffi.node`）も
弾かれる。こちらはディレクトリ名でアーキテクチャを分けている**正しい**作りなので、
両ビルドで同一なのは当然。ファイル名を個別に並べるとネイティブ依存を足すたびに
mac ビルドが壊れるので、`app.asar.unpacked` 全体を対象にしている。
Electron 自身のバイナリは対象外（あちらは本当にアーキテクチャごとに違うので
lipo される必要がある）。

これは**検査を黙らせているだけ**で、Intel Mac の問題は解決していない。
以前と同じ状態に戻しているに過ぎない。

**直すには**: ビルド時に x64 と arm64 両方の ffmpeg を取得し、`lipo` で
universal バイナリに結合してから同梱する（`beforePack` フック）。
ffmpeg-static は per-arch の配布物を持っているので取得自体は可能。

**影響範囲**: カメラ（RTSP）ドロワーのみ。他の機能は ffmpeg を使わない。
Apple Silicon Mac と Windows は影響なし。

---

## macOS: 署名・公証なし

Apple Developer Program（年 99 USD）に加入していないため、配布ビルドは
**アドホック署名のみ**で公証を受けていない。macOS 15 以降ではブラウザ経由で
ダウンロードするとブロック、場合によっては削除される。

`scripts/install-mac.sh`（`curl` 経由）で入れればこの問題は回避できる。
詳細は [`MACOS-INSTALL.md`](MACOS-INSTALL.md)。

---

## Windows: ポータブル版は自動更新できない

`electron-updater` はインストーラ（NSIS）版のみ対応。ポータブル版を使っている
場合は手動で入れ替える必要がある。

---

## e2e テストは headless Linux で2件落ちる

`e2e/app.spec.js` の3件中2件は、ドロワーの開閉がウィンドウリサイズと
`setIgnoreMouseEvents` に依存しているため、xvfb の簡易ウィンドウマネージャでは
再現しない。**Electron 31 でも 44 でも同じように落ちる**ので、アップグレードに
よる退行ではない。実機の Windows / macOS デスクトップが必要。

---

## 解決済み: バーが画面を覆い尽くすまで広がる（v0.1.74-beta.1 で修正）

**症状**: 起動すると画面の端から灰色のバーがじわじわ広がり、やがて画面全体を
覆う。初期にも一度起きていて、再燃していた。

**原因は3つ重なっていた**。どれも「バーの矩形を誰がどう決めるか」の問題。

### 1. `onDisplaysChanged` が横バー前提だった

```js
// 旧コード — 辺に関係なく上端・画面全幅に強制していた
e.win.setBounds({ x: d.x, y: top, width: d.width, height: b.height });
```

左右バーにこれを適用すると**画面全幅に引き伸ばされる**。しかも領域確保は
作業領域を変える → `display-metrics-changed` が発火する → **起動時に走る**。

### 2. 目標座標がウィンドウ自身の現在値に依存していた

`rePin()` の `Math.max(dr.height, wb.height)` と、`placeSpacer()` が
OSにクランプされた自分のサイズを書き戻していた処理。**目標が「最後に自分が
書いた値」に依存する**ため、一時的なズレ（OSの最小ウィンドウサイズ、DPI変更、
レイアウト途中のドロワー採寸）が固定されて二度と縮まない。move イベントと
ポーリングのたびにそれが太る。

### 3. 深さに上限がなかった

採寸が一度おかしくなるだけで画面より大きいウィンドウを要求できた。

**修正**: `rePin` / `placeSpacer` / メトリクス時の再配置を `pinBar()` 一本に
統合。目標矩形は **(ディスプレイ, 辺, OS予約, entry.extent) の純粋関数**で、
ウィンドウの現在値を一切参照しない。

### この不変条件を壊さないこと

> **バーの目標矩形を、バー自身の現在の `getBounds()` から計算してはいけない。**

これが `pinBar()` を冪等にしている。1回書いたら以降は no-op になるので、
自分が起こした `move` イベントでループが始まらない。`Math.max(…, 現在値)` を
書いた時点でこのバグが戻る。

深さの出どころはレンダラーの採寸ただ1つ（`overlay:set-height` → `entry.extent`）で、
メインプロセスの入口でディスプレイサイズにクランプする。OSの最小ウィンドウ
サイズは**一度だけOSに聞いて覚える**（自分の書き込みを読み返さない）。

`tests/layout.test.js` が3辺すべてで「伸ばして戻すと元に戻る」不動点性を
固定している。`electron . --selftest` は spacer とバーの内側の辺が一致すること、
待機時の深さがバー1枚分であることを数値で検証する（Windows のみ）。
