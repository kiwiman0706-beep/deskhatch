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
