## 本番デプロイ（最短手順 / TL;DR）

基本は次の2コマンドだけです（プロジェクト直下で実行）：

```bash
npm run build
sudo rsync -av --delete ./dist/ /var/www/glicocmms-assets-manager/dist/
```

これでNginxが配信する `dist/` が最新化され、フロントエンドの更新が反映されます。

---

## 前提（初回だけ必要）

- サーバに Node.js 18+ が入っている
- Nginx が稼働しており、`/var/www/glicocmms-assets-manager/dist/` を配信する設定になっている
- デプロイするユーザが `sudo` で `rsync` を実行できる

まだ準備が済んでいない場合は、以下の「初回セットアップ」を一度だけ行ってください。

---

## 初回セットアップ（1回きり）

1) 依存関係のインストール（プロジェクト直下）
```bash
npm install
```

2) Nginx のサイト設定（未設定の場合）
```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/industrial-asset-alert
sudo ln -s /etc/nginx/sites-available/industrial-asset-alert /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default || true
sudo nginx -t && sudo systemctl restart nginx
```

3) 配信ディレクトリを作成（初回のみ）
```bash
sudo mkdir -p /var/www/glicocmms-assets-manager/dist
sudo chown -R $USER:$USER /var/www/glicocmms-assets-manager
```

SSL（HTTPS）を使う場合は、サーバ側で証明書設定（例: Certbot）を別途行ってください。

---

## 繰り返しデプロイ（毎回の更新時）

コードを更新したら、次の2コマンドだけでOKです。

```bash
# 1) 本番ビルド
npm run build

# 2) ビルド成果物を公開ディレクトリへ反映
sudo rsync -av --delete ./dist/ /var/www/glicocmms-assets-manager/dist/
```

Nginxの再起動は不要です（静的ファイル配信のため）。

---

## バックエンドについて

フロントエンドとは別プロセスです。設定や再起動は `backend/` ディレクトリ配下で行ってください。

- 初回
  ```bash
  cd backend
  npm install
  cp env.example .env  # 必要項目を編集
  ```

- 起動/再起動（例）
  ```bash
  cd backend
  npm start
  # もしくは PM2 を利用
  # pm2 start server.js --name industrial-asset-backend && pm2 save
  ```

サーバ常駐や自動起動が必要なら PM2 の利用を推奨します。

---

## よくあるトラブル（簡易）

- 画面が更新されない: `npm run build` → `rsync` の順に再度実行。ブラウザキャッシュをクリア。
- 403/404 になる: Nginx の `root` と実ディレクトリ `/var/www/glicocmms-assets-manager/dist/` が一致しているか確認。
- Nginx 設定エラー: `sudo nginx -t` で構文チェック。`/var/log/nginx/error.log` を確認。

---

## メモ

- `rsync -av --delete` は差分同期＋不要ファイル削除を行います。配信先の `dist` は上書きされます。
- 権限エラーが出る場合は、配信先の所有者/権限を確認してください。
