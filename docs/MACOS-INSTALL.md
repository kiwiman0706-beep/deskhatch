# macOS でのインストール / Installing on macOS

> **要約 / TL;DR** — 現在の macOS ビルドは Apple の署名・公証（notarization）を
> 受けていません。そのため macOS 15 (Sequoia) 以降では起動をブロックされ、
> ときには **「マルウェアが含まれているため開けませんでした」と表示されて
> 自動的にゴミ箱へ移動** されます。下の手順で回避できますが、**恒久的な解決は
> Apple Developer Program の証明書で署名・公証すること** です。
>
> The macOS builds are not signed or notarized yet. On macOS 15 (Sequoia) and
> later this can produce **“… contains malware” and the app is moved to the
> Trash**. Workarounds below; the real fix is Developer ID signing + notarization.

---

## なぜ起きるのか / Why this happens

macOS がダウンロードしたアプリを削除するには、3 つの条件が重なる必要があります。

1. **公証されていない** — 公証済みなら Gatekeeper は添付チケットを信頼し、
   バイナリ自体を走査しません。未公証だと macOS が中身を直接スキャンします。
2. **隔離属性（quarantine）が付いている** — ブラウザ経由でダウンロードした
   ファイルに付き、これがあるため「初回起動時」にスキャンが走ります。
3. **XProtect の YARA ルールに一致した** — Apple のマルウェア定義に含まれる
   バイト列がたまたま一致すると、誤検知でもアプリは削除されます。

3 は Apple 側の定義更新でいつ起きてもおかしくなく、**以前は動いていたビルドが
定義更新や再起動後に突然消える**こともあります。こちらで制御できるのは 1 だけです。

<sub>Three conditions must line up: no notarization (so Gatekeeper scans the
binary instead of trusting a ticket), the quarantine bit from the download (so
the scan happens on launch), and an XProtect YARA rule that matches — which can
be a false positive. Only the first is under our control.</sub>

---

## 応急処置 / Workarounds

### すでにゴミ箱へ移動されてしまった場合

1. **ゴミ箱を開き**、`DeskHatch.app` を右クリック →「**戻す**」で元の場所へ復元。
2. ターミナルで隔離属性を外す（**起動する前に**実行してください）:

```bash
sudo xattr -dr com.apple.quarantine /Applications/DeskHatch.app
```

3. それでも「壊れているため開けません」と出る場合は、ローカルでアドホック署名:

```bash
sudo codesign --force --deep --sign - /Applications/DeskHatch.app
```

4. Finder で `DeskHatch.app` を開く。

### まだ削除されていない場合（推奨の入れ方）

```bash
# 1. dmg をマウントしてアプリをコピー（Finder でのドラッグでも可）
# 2. 起動する前に隔離属性を外す
sudo xattr -dr com.apple.quarantine /Applications/DeskHatch.app
# 3. 開く
open /Applications/DeskHatch.app
```

> **「右クリック → 開く」は macOS 15 以降では効きません。** Apple がこの
> 抜け道を廃止し、未公証アプリは **システム設定 → プライバシーとセキュリティ**
> の一番下に出る「**このまま開く**」から許可する方式に変わりました。ただし
> XProtect がマルウェア判定を出した場合はその項目自体が出ないため、上記の
> `xattr` が唯一の手段になります。
>
> <sub>Control-click → Open no longer works on macOS 15+. Use System Settings →
> Privacy & Security → “Open Anyway”, and when XProtect flags the app that
> option does not appear at all — only removing the quarantine bit helps.</sub>

**注意**: これらは Apple の保護を回避する操作です。**このリポジトリの
GitHub Releases から入手した**ファイルに対してのみ実行してください。

---

## 恒久対策 / The real fix

**Apple Developer Program（年 99 USD / 約 15,000 円）** に加入し、
**Developer ID Application** 証明書でアプリを署名 → Apple に公証を依頼 →
チケットを添付（staple）する。これで上記 3 条件のうち 1 と 3 が同時に消え、
ユーザーはダブルクリックするだけで起動できます。

ビルド側の受け入れ準備は済んでいます:

| 用意済み | 内容 |
|---|---|
| `build/entitlements.mac.plist` | hardened runtime 用の entitlements（Electron の JIT、koffi の dlopen、ffmpeg） |
| `build/entitlements.mac.inherit.plist` | ヘルパープロセス用 |
| `scripts/mac-adhoc-sign.js` | 証明書が無いときにアドホック署名する `afterPack` フック |
| `.github/workflows/release.yml` | シークレットがあれば署名＋公証、無ければ未署名にフォールバック |

必要な GitHub シークレットは 5 つです（設定手順は `docs/PUBLISHING.md`）:

| シークレット | 中身 |
|---|---|
| `MAC_CSC_LINK` | Developer ID Application 証明書（`.p12`）を base64 にしたもの |
| `MAC_CSC_KEY_PASSWORD` | その `.p12` のパスワード |
| `APPLE_ID` | Apple ID のメールアドレス |
| `APPLE_APP_SPECIFIC_PASSWORD` | appleid.apple.com で作る App 用パスワード |
| `APPLE_TEAM_ID` | 10 文字の Team ID |

5 つを登録すればワークフローが自動的に署名・公証ビルドへ切り替わり、
このページの応急処置は不要になります。
