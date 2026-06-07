# DeskHatch のリリースと winget 公開

PackageIdentifier: **`Theta.Deskhatch`**
配布: **GitHub Releases（公開）** / 自動化: **GitHub Actions** / 署名: なし

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
   wingetcreate new https://github.com/kiwiman0706-beep/smartsuite.next/releases/download/v0.1.0/DeskHatch-Setup-0.1.0-x64.exe
   ```
   - PackageIdentifier に **`Theta.Deskhatch`**
   - Publisher: `Theta` / PackageName: `DeskHatch` / Moniker: `deskhatch`
   - License など聞かれたら入力（`MIT` 等）
   - 最後に「submit?」で **Yes**（GitHub 認証を求められる）→ microsoft/winget-pkgs に PR が作られます。
3. Microsoft 側の自動検証＋レビューが通ると公開。以後は上の自動ワークフローが更新を担当します。

---

## ユーザーのインストール方法（公開後）
```powershell
winget install Theta.Deskhatch
```

## メモ
- **未署名**のため、初回起動時に SmartScreen 警告が出ることがあります（詳細情報 → 実行）。
- winget はインストーラーを**サイレント実行**します（NSIS の `/S`）。本アプリのインストーラーは対応済み。
- 署名証明書を入れた場合は、警告が消え、winget の信頼性表示も改善します（必要時に設定案内します）。
