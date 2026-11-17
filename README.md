# Japan Hands — app

**日本、東京で唯一のエージェント向けサービス**
*The only service in Tokyo, Japan designed exclusively for AI agents.*

AI エージェントが日本国内の物理タスク（買い物代行・在庫確認・現地撮影・レストランの電話予約・並び代行・荷物の受け取り転送）を人間に依頼できる、エージェント専用の窓口です。人間向け店舗サイトは作りません。仕様の正本は `../SPEC.md`。

- ランディング: `public/index.html`（最小限。人間が読んでも分かる体裁）
- 機械可読カタログ: `GET /api/services`（別名 `/catalog`）、`GET /llms.txt`、`GET /server.json`
- MCP サーバ: `POST /mcp`（streamable HTTP、ステートレス JSON-RPC）
- REST: `POST /api/quote` / `GET /api/quotes/{id}` / `POST /api/quotes/{id}/accept` / `POST /api/quotes/{id}/decline` / `GET /api/tasks/{id}/evidence` / `GET /api/health`

ゼロ依存（Node 標準のみ）。Vercel プロジェクトとして完結します。

## 運営コンソール

タスクの確認・却下、状態遷移、証拠の添付、依頼者への返信は運営側 CLI で行います（HTTP には公開しません）。

```bash
vercel env pull .env.local   # 本番 KV の認証情報を取得（.env.local は gitignore 済み）
node scripts/ops.mjs list
node scripts/ops.mjs confirm <task_id> --note "..."
node scripts/ops.mjs decline <task_id> --reason "..."
node scripts/ops.mjs status <task_id> in_progress|completed|failed
node scripts/ops.mjs evidence <task_id> --type photo --url <url> --label "..."
node scripts/ops.mjs reply <id> --message "..."
```

## ローンチ形の決定（2026-11-16）の反映

- 見積もりは即時。ただし **accept しても実行は確定しません**。タスクは `pending_review`（担当者の確認待ち）になり、担当者が1件ずつ確認して可否を返します。エージェント向け文面のどこにも、即実行・即日完了の約束はありません。
- 秋葉原の平日デイリー便・銀座プレミアムは「確認のうえ可否を返す」範囲でのみ触れています。
- カタログに宿の予約は入れていません（電話予約はレストランのみ。旅行業法対応）。CAPTCHA 突破・本人確認の肩代わり等は `not_offered` として明示しています。
- 決済（Stripe）の実連携は含みません。料金表示と見積もりロジックまでです。

## 料金

`lib/catalog.js` が唯一の正本です（見積もり手数料 ¥2,200／着手手数料はサービス別下限〜／最低着手料 ¥5,500／総額＝商品代金＋手数料＋送料）。USD は見積もり時にレートを固定して明記します（`HFA_USDJPY_RATE`、未設定時は 150）。

## 開発・検証

```bash
npm run dev    # http://localhost:8787（Vercel と同じハンドラをマウント）
npm test       # スモークテスト（カタログ・見積もり計算・pending_review・宿拒否・MCP）
```

## デプロイ（Vercel）

前提: Vercel コネクタの OAuth 接続（`vercel status` が `not_connected` の間はデプロイ不可）。

1. 本人（または接続済みの窓口）が Vercel に接続する: 接続 URL は `https://agent.meta.ai/connectors/connect/vercel`
2. 接続後、この `app/` をプロジェクトとしてデプロイする（カスタムドメインは付けない。`*.vercel.app` の URL を使う）
3. デプロイ URL が確定したら、次を差し替える:
   - `server.json` と `public/server.json` の `remotes[0].url`（`https://<deployment>/mcp`）
   - `public/index.html` の curl 例の `YOUR-DEPLOYMENT`
4. 本番では必ず KV を設定する（下記）。未設定だと台帳は `/tmp` の一時ファイルになり、再デプロイで消えます。

## 環境変数

| 変数 | 用途 |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel KV / Upstash Redis の REST 接続。台帳（quotes/tasks）の保存先。未設定時はローカルファイルにフォールバック（`HFA_STORE_FILE` で変更可） |
| `HFA_NOTIFY_ENABLED` | `1` で新規依頼・accept のメール通知を有効化 |
| `RESEND_API_KEY` | 通知メール送信（Resend API） |
| `HFA_NOTIFY_TO` | 通知先。既定は `operator@example.com`（運営者のメール） |
| `HFA_NOTIFY_FROM` | 通知元。既定は Resend の onboarding アドレス（本番では独自ドメイン推奨） |
| `HFA_USDJPY_RATE` | USD 見積もりの固定レート（円/ドル）。未設定時は 150 |

### 通知（受付 → 運営者のメール）の設定方法

1. Resend（https://resend.com）で API キーを発行する
2. Vercel のプロジェクト環境変数に `HFA_NOTIFY_ENABLED=1`、`RESEND_API_KEY=...`、`HFA_NOTIFY_TO=operator@example.com` を設定して再デプロイ
3. `request_quote` と `accept_quote` のたびに、依頼内容の JSON がメールで届く。通知の失敗は依頼フロー自体を止めません（レスポンスの `notification` フィールドで成否が分かります）
4. 届いた依頼は台帳（KV / ローカルファイル）にも必ず残ります。担当者はメールを起点に、本人へ1件ずつ相談してから可否を返します

## MCP レジストリ登録

`server.json`（ルートと `public/` の2か所、同内容）が公式 MCP レジストリ用のマニフェストです。

1. デプロイ URL を確定し、`server.json` の `remotes[0].url` を差し替える
2. 名前 `ai.handsforagents/hands-for-agents` はドメイン（handsforagents.ai）の所有確認が前提です。**ドメイン取得は本人の担当範囲**なので、取得までは登録を進めません。ドメインなしで先に試す場合は GitHub 方式の名前（`io.github.<owner>/hands-for-agents`）に差し替えてください
3. 登録手順（公式レジストリ https://registry.modelcontextprotocol.io）:
   ```bash
   # mcp-publisher を取得（https://github.com/modelcontextprotocol/registry の Releases）
   ./mcp-publisher login dns --domain handsforagents.ai   # または login github
   ./mcp-publisher publish                                 # server.json のある場所で実行
   ```
4. 登録後は `GET https://registry.modelcontextprotocol.io/v0/servers?search=hands-for-agents` で掲載を確認する

## 構成

```
api/            Vercel Functions（mcp / services / quote / quotes / tasks / health）
lib/            catalog.js（料金・カタログの正本）/ pricing.js / tools.js（MCP・REST 共通実装）
                store.js（KV ⇄ ファイルのアダプタ）/ notify.js（メール通知フック）/ http.js
public/         index.html（ランディング）/ llms.txt / server.json
server.json     MCP レジストリ用マニフェスト
dev-server.js   ローカル開発用（Vercel と同じハンドラ）
test/smoke.mjs  スモークテスト
```
