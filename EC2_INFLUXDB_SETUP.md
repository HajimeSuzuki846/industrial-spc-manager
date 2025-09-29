# EC2本番環境での InfluxDB 3 設定ガイド

このドキュメントでは、EC2 本番環境で InfluxDB 3（Explorer 含む）を正しく設定する手順を説明します。InfluxDB 3 は Database/Table ベースの新アーキテクチャで、クエリは基本的に SQL（FlightSQL）で実行します。Explorer は Web UI（本番: `https://influx3.glicocmms-assets-manager.com/`）です。

## 構成の概要

- InfluxDB 3 サービス
  - HTTP Write API: 8086
  - FlightSQL（gRPC/Arrow Flight）: 8082（クエリ用）
  - Explorer（UI）: 443（当環境では `influx3.glicocmms-assets-manager.com` の HTTPS）
- 本アプリの HOME ボタンから Explorer を開く: 本番では `https://influx3.glicocmms-assets-manager.com/`

## 解決方法

### 1. Explorer の公開（本番ドメイン）

Explorer は `https://influx3.glicocmms-assets-manager.com/` で公開します。ALB/NGINX 等で 443/TLS を終端し、内部の Explorer にルーティングしてください（本ドメインは外部 UI であり、アプリとは別ホスト運用を推奨）。

### 2. InfluxDB 3 のセットアップ

#### 2.1 インストール（Docker 推奨）

```bash
# InfluxDB 3（OSS/Edge 相当）の起動例
docker run -d \
  --name influxdb3 \
  -p 8086:8086 \  # HTTP Write API
  -p 8082:8082 \  # FlightSQL (gRPC)
  -e INFLUXDB3_DEFAULT_DATABASE=telemetry \
  -e INFLUXDB3_TELEMETRY_ENABLED=false \
  -v $PWD/influxdb3-data:/var/lib/influxdb3 \
  influxdb:3.0

docker ps
```

注: ディストリ配布/サービス化する場合は各 OS 用の InfluxDB 3 配布手順に従ってください。

#### 2.2 初期設定（Database / Token）

InfluxDB 3 では Organization/Bucket ではなく、Database（例: `telemetry`）と Table を使用します。認証は Token を使用します。

```bash
# ヘルスチェック
curl -s http://localhost:8086/health

# 書き込みテスト (Line Protocol)
curl -X POST "http://localhost:8086/api/v2/write?db=telemetry" \
  -H "Authorization: Token $INFLUX_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary "sensors,asset_id=demo value=1i"
```

#### 2.2 InfluxDBの設定確認

```bash
# InfluxDBの状態確認
sudo systemctl status influxdb

# 接続テスト
influx ping

# 組織とバケットの確認
influx org list
influx bucket list
```

### 3. アプリケーションの設定

#### 3.1 フロントエンドでの設定

HOME 画面のボタンから Explorer を開きます。

- ローカル: `http://localhost:8888`
- 本番（EC2）: `https://influx3.glicocmms-assets-manager.com/`

アプリのバックエンドからの書き込みは HTTP 8086 を使用します（Database 名と Token を設定）。

#### 3.2 環境変数の設定

バックエンドの環境変数を設定します：

```bash
# .envファイルまたは環境変数
NODE_ENV=production
DOMAIN=your-domain.com
```

### 4. 設定の確認手順

#### 4.1 接続テスト（HTTP 8086）

```bash
curl -s http://localhost:8086/health
```

#### 4.2 クエリ確認（FlightSQL 8082）

Explorer または FlightSQL クライアントから SQL を実行します。

```sql
SELECT * FROM telemetry."sensors" ORDER BY time DESC LIMIT 10;
```

### 5. トラブルシューティング

#### 5.1 よくある問題

**問題**: 接続テストは成功するが設定確認でエラーが発生する

**原因**: フロントエンドからInfluxDBに直接アクセスできない

**解決方法**: 
- nginxのプロキシ設定を確認
- InfluxDBのURLが正しく設定されているか確認
- ファイアウォールの設定を確認

**問題**: CORSエラーが発生する

**原因**: InfluxDBのCORS設定が不適切

**解決方法**:
- nginxのCORS設定を確認
- InfluxDBの設定でCORSを有効にする

#### 5.2 ログの確認

```bash
# nginxのログ確認
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# InfluxDBのログ確認
sudo journalctl -u influxdb -f

# アプリケーションのログ確認
pm2 logs
```

### 6. セキュリティ設定

#### 6.1 ファイアウォールの設定

```bash
# InfluxDB のポート制御（サーバ内で閉域運用、必要に応じて）
sudo ufw allow from 127.0.0.1 to any port 8086  # HTTP Write
sudo ufw allow from 127.0.0.1 to any port 8082  # FlightSQL
sudo ufw deny 8086
sudo ufw deny 8082
```

#### 6.2 SSL/TLS

Explorer 側は `https://influx3.glicocmms-assets-manager.com/` で TLS 終端。内部の 8086/8082 は基本ローカルまたは VPC 内のみに制限してください。

### 7. パフォーマンス最適化

#### 7.1 データ保持/パーティション

InfluxDB 3 では Database 単位での保持・パーティション設計を行います。運用方針に応じて Database を分けてください（例: `telemetry`, `logs` など）。

#### 7.2 システムリソースの確認

```bash
# メモリ使用量の確認
free -h

# ディスク使用量の確認
df -h

# InfluxDBのプロセス確認
ps aux | grep influxdb
```

## まとめ

EC2 本番環境で InfluxDB 3 を正しく動作させるには：

1. **Explorer の公開**（`https://influx3.glicocmms-assets-manager.com/`）
2. **8086/8082 のアクセス制御**（ローカル/VPC 内）
3. **Database/Token の適切な設定**
4. **監視とセキュリティ設定**の実施

これらの設定により、フロントエンドからInfluxDBに安全にアクセスできるようになります。
