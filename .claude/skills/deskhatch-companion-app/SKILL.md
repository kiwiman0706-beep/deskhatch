---
name: deskhatch-companion-app
description: DeskHatch のドロワーから開けるコンパニオンアプリを作る／既存アプリを対応させるときの契約。「DeskHatch に組み込みたい」「ドロワーとして開きたい」「DeskHatch 連携」と言われたとき、および名刺管理・書類管理・本棚(DSBooks)のような自作デスクトップアプリを新規に設計するときに読む。ループバックHTTPでUIを配信し /ping で生存を知らせ --background で待機起動する、という4つの必須要件と、DeskHatch 側の登録方法を含む。Use when building or adapting a desktop app that should appear as a DeskHatch drawer.
---

# DeskHatch コンパニオンアプリの作り方

DeskHatch（画面最上部のランチャーバー）は、`type: 'localapp'` のドロワーで
**ローカルで動くデスクトップアプリの UI をそのまま埋め込める**。

この契約を満たすアプリは、**DeskHatch 側のコード変更なしで**組み込める。
DeskHatch 側は `src/renderer/config.js` の `SS_LOCALAPPS` に1項目足すだけ。

## 新しくアプリを作るときの設計判断

「このアプリは DeskHatch のドロワーに出したいか？」が Yes なら、
**設計の最初から**以下を組み込む。後付けは面倒になる。

### 必須4点

**1. UI をループバック HTTP で配信する**

```
http://127.0.0.1:<固定ポート>/
```

- `0.0.0.0` にバインドしない（LAN に晒さない）
- ポートは固定。他アプリと衝突しない値を選ぶ
- **幅 360px から崩れないレイアウト**にする。ドロワーは細い
- DeskHatch は `127.0.0.1` / `::1` / `localhost` 以外には接続しない（メインプロセスで強制）

**2. ヘルスエンドポイント**

```
GET /ping  →  200  {"app": "myapp"}
```

認証不要・副作用なし。DeskHatch は起動待ちの間、数百msごとに叩く。
返す JSON は `expect` で照合され、**ポートを別プロセスが握っていた場合の誤認を防ぐ**。

**3. 「画面を出さずに待機」する起動引数**

```
myapp.exe --background   # サーバだけ起動。自前ウインドウは出さない
myapp.exe                # 通常起動（自前ウインドウを出す）
```

これが無いと、ドロワーを開くたびにアプリ本体のウインドウも出てきてしまう。

**4. 二重起動に耐える**

DeskHatch は応答が無ければ起動を試みる。競合で二重起動されうるので、
2つ目のプロセスは即終了するか、既存プロセスに委ねる。

### 設計上の前提

- **DeskHatch はビューアに徹する。** データも状態もアプリ側が持つ
- **プロセスは止められない。** ドロワーを閉じても、DeskHatch が終了しても、
  起動したプロセスは detached で生き続ける。自分のライフサイクルは自分で管理する
  （タスクトレイ常駐など）
- **webview の保存領域は別物。** `persist:localapp-<id>` という専用パーティション。
  状態を webview 側に持たせない
- **重い作業画面は自前の別ウインドウで。** ドロワーは狭い。
  DSBooks は「ドロワーで本を選ぶ → 本体が別ウインドウで開く」形を取っている

### 任意

**アクションエンドポイント** — 右クリックメニューに項目を足せる。

```
GET /show  →  自前のウインドウを前面に出す
```

`GET` 1発で完結する副作用に限る。認証不要。

## DeskHatch 側の登録

`src/renderer/config.js`:

```js
window.SS_LOCALAPPS = [
  {
    id: 'myapp',                         // 一意。persist:localapp-<id> になる
    label: L('名刺'), icon: '📇',
    type: 'localapp', width: 520,

    url: 'http://127.0.0.1:47820/',      // ループバックのみ
    health: '/ping',                     // url からの相対
    expect: { app: 'myapp' },            // ヘルス JSON の部分集合

    launch: {
      win32: { exe: '%LOCALAPPDATA%\\Programs\\MyApp\\MyApp.exe',
               args: ['--background'] },
      darwin: { exe: '/Applications/MyApp.app/Contents/MacOS/MyApp',
                args: ['--background'] },
    },

    actions: [
      { label: L('ウインドウを開く'), get: '/show', launchArgs: [] },
    ],

    platforms: ['win32'],                // 省略時は全OS
    download: 'https://example.com/dl',  // exe 不在時の案内先（任意）
  },
];
```

`exe` の `%VAR%` は展開される（Windows 流に大文字小文字無視）。先頭 `~/` も展開。

## 動作

1. `health` を確認 → 応答し `expect` を満たせば UI 表示
2. 応答なし → exe を detached 起動 →「起動しています…」を出しつつ
   最大15秒ポーリング（150ms から徐々に1秒間隔へ）
3. exe が無い → 「見つかりません」＋ 場所を指定／ダウンロード／再試行
4. タイムアウト → 再試行ボタン

ユーザーが指定したパスは `ss.localapp.exe` に保存され、既定パスより優先される。

`url` と同一オリジン以外への遷移は、ドロワーを連れて行かずに標準ブラウザで開く。

## セキュリティ境界

ドロワー定義はユーザーが持ち込むデータなので、2点をメインプロセスで強制している。
**アプリ側もこれを前提に設計すること。**

- **HTTP はループバック限定。** `localhost.evil.com` のような引っかけも弾く。
  これが無いとドロワー定義が SSRF の入口になる
- **起動はシェルを経由しない。** `spawn(exe, argv, {shell:false})` のみ。
  実在するファイルであることを確認してからしか起動しない
- ヘルス応答は 64KB で打ち切る

ループバックでも**他のローカルプロセスからは叩ける**ので、
機微なデータを返す API にはトークンを要求すること（`/ping` だけは認証不要にする）。

## 実装の在りか（DeskHatch リポジトリ）

| ファイル | 役割 |
|---|---|
| `docs/LOCALAPP-PROTOCOL.md` | 完全版の契約（この skill の元ネタ） |
| `src/renderer/lib/localapp.js` | 純粋ロジック（ループバック判定・`%VAR%` 展開・`expect` 照合・状態遷移） |
| `src/main/localapp.js` | ループバック GET・exe 解決・detached 起動 |
| `src/renderer/renderer.js` | `buildLocalApp()` / `runLocalAppAction()` |
| `src/renderer/config.js` | `SS_LOCALAPPS` プリセット |
| `tests/localapp*.test.js` | 純粋ロジック＋スタブサーバー結合テスト |

## 実績

- **DSBooks**（NAS 本棚・読書アプリ、Windows）— 1例目。ポート 47817

## 新しいアプリを足す手順

1. アプリ側で必須4点を実装
2. `SS_LOCALAPPS` に1項目追加
3. 終わり

**コード変更が必要になったら、それはプロトコルを拡張すべきサイン。**
その場合は `docs/LOCALAPP-PROTOCOL.md` とこの skill も併せて更新すること。
