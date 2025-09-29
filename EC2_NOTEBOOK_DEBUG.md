# EC2環境でのNotebook API 404エラー デバッグガイド

## 問題の概要

EC2本番環境でNotebookのテスト実行が404エラーで失敗する問題のデバッグ手順です。

## デバッグ手順

### 1. バックエンドサーバーの状態確認

```bash
# バックエンドプロセスの確認
ps aux | grep node

# バックエンドログの確認
cd /path/to/backend
tail -f logs/app.log  # または適切なログファイル

# バックエンドの再起動
cd /path/to/backend
npm restart  # または適切な再起動コマンド
```

### 2. バックエンドサーバーの直接テスト

```bash
# ローカルホストでの直接テスト
curl -X POST http://localhost:3001/api/notebook/run \
  -H "Content-Type: application/json" \
  -d '{"notebook": "test", "parameters": {}}'

# レスポンスを確認
# 成功: JSONレスポンス
# 404: {"error": "Not Found", "message": "Route POST /api/notebook/run not found"}
```

### 3. nginx設定の確認

```bash
# nginx設定ファイルの確認
sudo nginx -t

# nginx設定の確認
sudo cat /etc/nginx/sites-available/industrial-asset-alert

# nginxの再起動
sudo systemctl restart nginx

# nginxログの確認
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### 4. フロントエンドからのリクエスト確認

ブラウザの開発者ツールで以下を確認：

1. Network タブで `/api/notebook/run` へのリクエストを確認
2. リクエストURLが正しいか確認
3. レスポンスヘッダーとステータスコードを確認

### 5. 環境変数の確認

```bash
# バックエンドディレクトリで環境変数を確認
cd /path/to/backend
cat .env

# または環境変数の直接確認
echo $NODE_ENV
echo $PORT
```

## 修正されたコードの確認

以下の修正が適用されていることを確認：

1. **Notebook APIエンドポイントのデバッグログ追加**
   - リクエストがエンドポイントに到達したかログで確認
   - リクエストの詳細情報をログ出力

2. **登録されたルートの確認**
   - サーバー起動時に登録されたルート一覧をログ出力

3. **404エラーの詳細ログ**
   - 404エラーが発生した場合の詳細情報をログ出力

## 期待されるログ出力

### 正常な場合
```
=== NOTEBOOK API ENDPOINT HIT ===
Request URL: /api/notebook/run
Request method: POST
...
```

### 404エラーの場合
```
=== 404 ERROR ===
Request URL: /api/notebook/run
Request method: POST
...
```

## よくある原因と解決方法

### 1. nginx設定の問題
- `/api/` パスがバックエンドにプロキシされていない
- nginx設定ファイルが正しく読み込まれていない

### 2. バックエンドサーバーの問題
- バックエンドサーバーが起動していない
- ポート3001でリッスンしていない
- ルートが正しく登録されていない

### 3. 静的ファイル配信の問題
- 静的ファイル配信がAPIルートより前に配置されている
- フロントエンドのビルドが古い

## 緊急対応

問題が解決しない場合の緊急対応：

1. **バックエンドの完全再起動**
```bash
cd /path/to/backend
pkill -f node
npm start
```

2. **nginxの完全再起動**
```bash
sudo systemctl stop nginx
sudo systemctl start nginx
```

3. **フロントエンドの再ビルド**
```bash
cd /path/to/frontend
npm run build
sudo rsync -av --delete ./dist/ /var/www/glicocmms-assets-manager/dist/
```
