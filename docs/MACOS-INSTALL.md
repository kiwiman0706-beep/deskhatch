# macOS でのインストール / Installing on macOS

> **要約 / TL;DR** — ブラウザで `.dmg` をダウンロードすると、macOS 15 (Sequoia)
> 以降では起動をブロックされ、ときには「**マルウェアが含まれているため開けません
> でした**」と表示されて自動的にゴミ箱へ移動されます。
> **`curl` で入れれば、この問題は起きません。**
>
> ```bash
> curl -fsSL https://raw.githubusercontent.com/kiwiman0706-beep/deskhatch/HEAD/scripts/install-mac.sh | bash
> ```
>
> <sub>Downloading the `.dmg` in a browser can get the app blocked — or deleted
> as "malware" — on macOS 15+. Installing with the `curl` line above avoids it.</sub>

---

## なぜ起きるのか / Why this happens

アプリが削除されるには、3 つの条件が**すべて**揃う必要があります。

| # | 条件 | 外せるか |
|---|---|---|
| 1 | **公証されていない**（未公証だと macOS はバイナリを直接スキャンする） | ❌ Apple Developer Program（年 99 USD）が必要 |
| 2 | **隔離属性 `com.apple.quarantine` が付いている**（これがスキャンの引き金） | ✅ **外せる** |
| 3 | **XProtect の YARA ルールに一致した**（誤検知でも削除される） | ❌ Apple の定義次第 |

ポイントは **2 番**です。隔離属性は「ダウンロードしたアプリ」が付けるもので、
Safari・Chrome・Firefox は付けますが、**`curl` は付けません**。自分の Mac で
ビルドしたアプリにも付きません。つまり **2 を外せばスキャン自体が走らず、
1 と 3 が成立していても何も起きません。**

<sub>Three conditions must all line up. The quarantine attribute (#2) is set by
the downloading app — browsers set it, `curl` does not, and a local build never
has it. Remove that one and the launch-time scan never runs.</sub>

---

## 入れ方（おすすめ順）

### 方法 1: curl でインストール（無料・推奨）

```bash
# 最新の安定版
curl -fsSL https://raw.githubusercontent.com/kiwiman0706-beep/deskhatch/HEAD/scripts/install-mac.sh | bash

# 最新のベータ版
curl -fsSL https://raw.githubusercontent.com/kiwiman0706-beep/deskhatch/HEAD/scripts/install-mac.sh | bash -s -- --beta
```

スクリプト（[`scripts/install-mac.sh`](../scripts/install-mac.sh)）がやること:

1. GitHub Releases から universal `.zip` を `curl` で取得（→ 隔離属性が付かない）
2. 展開してローカルでアドホック署名（古いビルドの「壊れている」対策）
3. `/Applications` へ配置（書き込めなければ `~/Applications`）

更新するときは同じコマンドをもう一度実行するだけです。

> `curl | bash` に抵抗がある場合は、先に中身を読んでから実行してください:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/kiwiman0706-beep/deskhatch/HEAD/scripts/install-mac.sh -o install-mac.sh
> less install-mac.sh
> bash install-mac.sh
> ```

### 方法 2: 自分の Mac でビルドする（無料・最も確実）

ビルドしたアプリはダウンロードされていないので、隔離属性が最初から付きません。

```bash
git clone https://github.com/kiwiman0706-beep/deskhatch.git
cd deskhatch
npm install
npm run dist:mac
open dist/mac-universal          # ここの DeskHatch.app を /Applications へ
```

Node.js が必要です（`brew install node`）。10 分ほどかかります。

### 方法 3: ブラウザでダウンロードした場合の後始末

すでに `.dmg` を落としてしまった、あるいはもう消された場合:

1. **ゴミ箱を開き**、`DeskHatch.app` を右クリック →「**戻す**」で復元
2. **起動する前に**隔離属性を外す:

```bash
xattr -dr com.apple.quarantine /Applications/DeskHatch.app
```

3. それでも「壊れているため開けません」と出る場合はローカルで署名:

```bash
codesign --force --deep --sign - /Applications/DeskHatch.app
```

> **「右クリック → 開く」は macOS 15 以降では効きません。** Apple がこの抜け道を
> 廃止し、**システム設定 → プライバシーとセキュリティ**の下部に出る
> 「**このまま開く**」から許可する方式になりました。さらに XProtect が
> マルウェア判定を出した場合はその項目すら出ないため、上の `xattr` が唯一の
> 手段になります。
>
> <sub>Control-click → Open no longer works on macOS 15+. Use System Settings →
> Privacy & Security → "Open Anyway" — and when XProtect flags the app, that
> option does not appear at all, so only clearing the quarantine bit helps.</sub>

**注意**: 方法 3 は Apple の保護を意図的に外す操作です。**このリポジトリの
GitHub Releases から入手した**ファイルに対してのみ実行してください。

---

## 残るリスク / What this does not fix

隔離属性を外すと**起動時のスキャン**は走りませんが、macOS には別途
**XProtect Remediator** が定期的にバックグラウンド走査を行う仕組みがあります。
可能性は低いものの、これが後からアプリを削除することは理論上あり得ます。
もし再発したら、方法 1 か 2 で入れ直してください。

## 更新 / Updating

**アプリ内の自動更新が使えます。** 起動時と ☰ メニューの「🔄 更新を確認」で
GitHub Releases を確認し、新しい版があれば**アプリ自身がダウンロードして
入れ替え**ます（`src/main/mac-update.js`）。

Squirrel.Mac（electron-updater の macOS 実装）は署名を検証するため未署名ビルドでは
使えませんが、やっていることは同じです: リリースの universal `.zip` を取得 →
`ditto` で展開 → アドホック署名 → バンドルを差し替え → 再起動。
**ブラウザを経由しないので隔離属性が付かず**、入れ替えた新しい版もブロックされません。

失敗した場合は方法 1 のコマンドを再実行してください（アプリもその案内を出します）。

---

## 恒久対策（有料）/ The paid fix

**Apple Developer Program（年 99 USD）** に加入して **Developer ID Application**
証明書で署名し、Apple に公証を依頼してチケットを添付（staple）すれば、上の
3 条件のうち 1 と 3 が同時に消え、ユーザーはダブルクリックするだけで起動でき、
macOS の自動更新も使えるようになります。

**個人利用なら方法 1・2 で十分**なので急ぐ必要はありませんが、配布先が増えて
きたら検討する価値があります。ビルド側の受け入れ準備は済んでいて、GitHub に
5 つのシークレットを登録した時点で自動的に署名＋公証ビルドへ切り替わります
（手順は [`PUBLISHING.md`](PUBLISHING.md)）。

| 用意済み | 内容 |
|---|---|
| `build/entitlements.mac.plist` | hardened runtime 用の entitlements（Electron の JIT、koffi の dlopen、ffmpeg） |
| `build/entitlements.mac.inherit.plist` | ヘルパープロセス用 |
| `scripts/mac-adhoc-sign.js` | 証明書が無いときにアドホック署名する `afterPack` フック |
| `scripts/install-mac.sh` | 隔離属性を付けずに入れるインストーラー |
| `.github/workflows/release.yml` | シークレットがあれば署名＋公証、無ければ未署名にフォールバック |
