# 仕入れ代行 利益シミュレーター

仕入れ代行の手数料率（10%／20%など）ごとに年間PLを横並びで比較するツール。
データは Upstash Redis に保存（ブラウザ保存なし）。

## 構成
- フロント：React + Vite（`src/`）
- API：Vercel API Routes（`api/sims.js`）
- 保存先：Upstash Redis
- 計算ロジック：`shared/calc.js`（フロントとAPIで共用）

## デプロイ手順
1. このリポジトリを Vercel で Import（Framework は Vite を自動認識）
2. Vercel の Storage から Upstash for Redis を作成してプロジェクトに接続
   - `KV_REST_API_URL` / `KV_REST_API_TOKEN` が自動で入ります
   - Upstash直結の場合は `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` でもOK
3. （任意）環境変数 `APP_PASSCODE` を設定するとパスコード入力が必須になります
4. 再デプロイ

## Redisのキー
- `ps:ids` … シミュレーションIDのセット
- `ps:sim:{id}` … シミュレーション本体（JSON）

一覧は SMEMBERS → MGET でまとめて取得。初回アクセス時に「基本シミュレーション」を自動作成します。
