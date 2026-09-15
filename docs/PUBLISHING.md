# DeskHatch のリリースと winget 公開

PackageIdentifier: **`Theta.DeskHatch`**
配布: **GitHub Releases（公開）** / 自動化: **GitHub Actions** / 署名: なし（macOS の署名・公証は下記参照）

---

## 一度だけの準備（初回のみ）

1. **リポジトリを Public にする**
   winget の検証はインストーラーを実際にダウンロードします。リリース資産が公開されている必要があります（= リポジトリ公開）。

2. **microsoft/winget-pkgs を自分のアカウントに Fork**
   `https://github.com/microsoft/winget-pkgs` → Fork（`kiwiman0706-beep/winget-pkgs` ができる）。
   自動PRワークフローがこの fork にブランチを push します。

3. **PAT（Personal Access Token, classic）を発行**
   GitHub → Settings → Developer settings → Tokens (classic) → スコープ **`public_repo`**。
   それをこのリポジトリの **Settings → Secrets and variables → Actions → New repository secret** に
   名前 **`WINGET_TOKEN`** で登録。

---

## 新バージョンを出す手順（毎回）

1. `package.json` の **`version`** を上げる（例 `0.1.0` → `0.1.1`）。
2. コミットして **タグを打って push**:
   ```bash
   git commit -am "release v0.1.1"
   git tag v0.1.1
   git push origin v0.1.1
   ```
3. GitHub Actions（`release` ワークフロー）が自動で：
   - Windows ランナーでビルド（`DeskHatch-Setup-x.y.z-x64.exe` / `DeskHatch-Portable-x.y.z-x64.exe`）
   - **公開 Release を作成**して上記を添付
   - winget へ **更新PRを自動送信**（※ 2回目以降）

---

## 初回だけ：winget へ最初の登録（wingetcreate）

自動PRワークフローは「既に winget に存在するパッケージの更新」用です。
**最初の1回だけ**、`wingetcreate` で新規登録します（自分の Windows PC で）。

1. wingetcreate を入れる:
   ```powershell
   winget install Microsoft.WingetCreate
   ```
2. 最初の Release ができたら、その Setup の URL を使って新規作成:
   ```powershell
   wingetcreate new https://github.com/kiwiman0706-beep/deskhatch/releases/download/v0.1.0/DeskHatch-Setup-0.1.0-x64.exe
   ```
   - PackageIdentifier に **`Theta.DeskHatch`**
   - Publisher: `Theta` / PackageName: `DeskHatch` / Moniker: `deskhatch`
   - License など聞かれたら入力（`MIT` 等）
   - 最後に「submit?」で **Yes**（GitHub 認証を求められる）→ microsoft/winget-pkgs に PR が作られます。
3. Microsoft 側の自動検証＋レビューが通ると公開。以後は上の自動ワークフローが更新を担当します。

---

## ユーザーのインストール方法（公開後）
```powershell
winget install Theta.DeskHatch
```

## メモ
- **未署名**のため、初回起動時に SmartScreen 警告が出ることがあります（詳細情報 → 実行）。
- winget はインストーラーを**サイレント実行**します（NSIS の `/S`）。本アプリのインストーラーは対応済み。
- 署名証明書を入れた場合は、警告が消え、winget の信頼性表示も改善します（必要時に設定案内します）。

---

## macOS の署名・公証（notarization）

現状 macOS ビルドは**未署名**です。macOS 15 (Sequoia) 以降ではこれが原因で
起動をブロックされ、XProtect の誤検知で**アプリが勝手にゴミ箱へ移動される**
ことがあります（症状と応急処置は [`MACOS-INSTALL.md`](MACOS-INSTALL.md)）。

ワークフロー側の受け入れ準備は済んでいるので、**下の 5 つのシークレットを
登録した時点で、次のリリースから自動的に署名＋公証ビルドに切り替わります。**
登録しなければ従来どおり未署名ビルドが出ます（ビルドは失敗しません）。

### 1. Apple Developer Program に加入
年 99 USD。<https://developer.apple.com/programs/> から。承認まで数日かかることがあります。

### 2. Developer ID Application 証明書を作る
1. Mac の **キーチェーンアクセス → 証明書アシスタント → 認証局に証明書を要求**
   で CSR (`.certSigningRequest`) を作成（「ディスクに保存」を選択）。
2. <https://developer.apple.com/account/resources/certificates/list> →
   **+** → **Developer ID Application** を選び、CSR をアップロード。
3. 発行された `.cer` をダウンロードしてダブルクリック（キーチェーンに入る）。
4. キーチェーンで **秘密鍵ごと**書き出して `.p12` にする（パスワードを設定）。

### 3. App 用パスワードと Team ID
- App 用パスワード: <https://appleid.apple.com> → サインインとセキュリティ →
  **App 用パスワード** で生成（`xxxx-xxxx-xxxx-xxxx` 形式）。
- Team ID: <https://developer.apple.com/account> の Membership に載っている 10 文字。

### 4. GitHub シークレットに登録
リポジトリの **Settings → Secrets and variables → Actions** で以下を追加。

| 名前 | 値 |
|---|---|
| `MAC_CSC_LINK` | `.p12` を base64 にした文字列 → `base64 -i cert.p12 \| pbcopy` |
| `MAC_CSC_KEY_PASSWORD` | `.p12` のパスワード |
| `APPLE_ID` | Apple ID のメールアドレス |
| `APPLE_APP_SPECIFIC_PASSWORD` | 手順 3 の App 用パスワード |
| `APPLE_TEAM_ID` | 10 文字の Team ID |

### 5. 確認
次のリリース後、`build-mac` ジョブの **Report signing status** ステップを見る。

- `Authority=Developer ID Application: ...` が出ていれば署名 OK
- `source=Notarized Developer ID` が出ていれば Gatekeeper 通過
- `The validate action worked!` が出ていればチケットの staple 成功

公証は Apple のサーバー待ちで 5〜30 分ほどかかるため、mac ジョブの所要時間が伸びます。

### 関連ファイル
- `build/entitlements.mac.plist` / `build/entitlements.mac.inherit.plist` —
  hardened runtime 用。Electron の JIT、koffi の `dlopen`、`ffmpeg-static` に
  必要な権限が入っています。**これが無いと公証済みビルドは起動直後に落ちます。**
- `scripts/mac-adhoc-sign.js` — 証明書が無いときに**アドホック署名**だけ付ける
  `afterPack` フック。公証の代わりにはなりませんが、バンドルとして壊れていない
  状態にはなります。
