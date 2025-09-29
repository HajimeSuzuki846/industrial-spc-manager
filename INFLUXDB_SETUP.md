# InfluxDB 3 セットアップガイド

このドキュメントでは、MQTT受信データをInfluxDBに蓄積するためのセットアップ手順を説明します。

## 概要

InfluxDB 3 は Database/Table ベースの時系列データベースです。このシステムでは、MQTT メッセージを受信するたびに InfluxDB へデータを書き込み、Explorer（UI）や SQL（FlightSQL）で参照します。

## インストール

### ローカル開発環境

#### Docker を使用する場合（推奨）

```bash
# InfluxDB 3 を起動
docker run -d \
  --name influxdb3 \
  -p 8086:8086 \  # HTTP Write API
  -p 8082:8082 \  # FlightSQL (gRPC)
  -e INFLUXDB3_DEFAULT_DATABASE=telemetry \
  -e INFLUXDB3_TELEMETRY_ENABLED=false \
  -v $PWD/influxdb3-data:/var/lib/influxdb3 \
  influxdb:3.0

# コンテナの状態確認
docker ps
```

#### 直接インストールする場合（OS パッケージ）

1. InfluxDB 3 の配布に従いインストール
2. サービス起動（8086/8082 開放が必要）
3. 初期 Database（例: `telemetry`）と Token を準備

### EC2 本番環境

#### Ubuntu/Debian

```bash
# InfluxDB リポジトリを追加（参考、配布に応じて適宜）
wget https://repos.influxdata.com/influxdata-archive_compat.key
echo '393e8779c89ac8d958f81f942f9ad7fb82a25e133faddaf92e15b16e6ac9ce4c influxdata-archive_compat.key' | sha256sum -c && cat influxdata-archive_compat.key | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/influxdata-archive_compat.gpg > /dev/null
echo 'deb [signed-by=/etc/apt/trusted.gpg.d/influxdata-archive_compat.gpg] https://repos.influxdata.com/debian stable main' | sudo tee /etc/apt/sources.list.d/influxdata.list

# パッケージを更新してInfluxDBをインストール
sudo apt-get update
sudo apt-get install influxdb3

# InfluxDB を起動
sudo systemctl start influxdb
sudo systemctl enable influxdb

# 初期設定（Database/Token を作成）
# Explorer や API から作成可能。Database 例: telemetry
```

#### Amazon Linux 2

```bash
# InfluxDBのリポジトリを追加
cat <<EOF | sudo tee /etc/yum.repos.d/influxdata.repo
[influxdata]
name = InfluxData Repository (stable)
baseurl = https://repos.influxdata.com/stable/\$basearch/main
enabled = 1
gpgcheck = 1
gpgkey = https://repos.influxdata.com/influxdata-archive_compat.key
EOF

# InfluxDBをインストール
sudo yum install influxdb2

# InfluxDBを起動
sudo systemctl start influxdb
sudo systemctl enable influxdb

# 初期設定
influx setup \
  --username admin \
  --password Glico2030 \
  --org glico \
  --bucket telemetry \
  --token SuperSecretToken \
  --force
```

## 設定

### 1. アプリケーションでの設定（Explorer/Write）

1. 管理者設定画面を開く
2. 「InfluxDB設定」タブを選択
3. 以下の情報を入力：
   - **Explorer（UI）**
     - ローカル: `http://localhost:8888`
     - 本番: `https://influx3.glicocmms-assets-manager.com/`
   - **Write API**（HTTP 8086）
     - URL: `http://localhost:8086`（EC2 ではローカル/プライベート）
     - Database: `telemetry`
     - Token: 発行したトークン

### 2. 設定例

#### ローカル開発環境（例）
```
Explorer: http://localhost:8888
Write API: http://localhost:8086
Database: telemetry
Token: SuperSecretToken
```

#### EC2 本番環境（例）
```
Explorer: https://influx3.glicocmms-assets-manager.com/
Write API: http://localhost:8086
Database: telemetry
Token: SuperSecretToken
```

## データモデル（例）

MQTT メッセージは以下の構造で InfluxDB に保存します（Line Protocol 相当）。InfluxDB 3 では Database: `telemetry`、Table: `sensors` 等のテーブル名に格納します。

### データの一貫性について

システムは以下のルールでデータの一貫性を保っています：

1. **Asset情報がデータベースに登録されている場合**：
   - 常にAssetの階層構造に基づいてタグを設定
   - 測定名はAssetのタイプ（sensor、actuator等）を使用

2. **Asset情報がデータベースに登録されていない場合**：
   - トピック構造に基づいてタグを設定
   - 測定名はトピックの最初の部分を使用

3. **データの一貫性チェック**：
   - `/api/influxdb/consistency`エンドポイントでデータの一貫性を確認可能
   - 同じトピックに対して異なるタグ構造が使用されていないかチェック

### テーブル（Table）
- Asset 情報がある場合: `sensors` など用途別テーブルに保存
- Asset 情報がない場合: `raw_mqtt` などの受け口テーブルに保存

### タグ（Tags）
- `topic`: 完全なMQTTトピック
- `factory`: 工場名（Assetの階層構造から取得）
- `line`: ライン名（Assetの階層構造から取得）
- `sensor`: センサー名（Assetの階層構造から取得）
- `asset_id`: アセットのユニークID（UUID、Asset情報が登録されている場合のみ）

### フィールド（Fields）
- MQTTメッセージの内容がフィールドとして保存されます
- 数値、文字列、ブール値が適切な型で保存されます

### Asset階層構造に基づくタグ設定

システムは以下の優先順位でタグを設定します：

1. **Asset情報がデータベースに登録されている場合**：
   - `factory`: 工場名（factories.name）
   - `line`: ライン名（production_lines.name）
   - `sensor`: アセット名（assets.name）
   - `asset_id`: アセットのユニークID（assets.id）

2. **Asset情報が登録されていない場合**：
   - 従来の方法でトピックから抽出
   - `factory`: トピックの2番目の部分
   - `line`: トピックの3番目の部分
   - `sensor`: トピックの4番目の部分

### 例

#### Asset情報が登録されている場合

データベースのAsset情報:
```
工場: "Manufacturing Plant A" (factory1)
ライン: "Production Line 1" (line1)
アセット: "Temperature Sensor 001" (asset1)
MQTTトピック: "factory1/line1/temperature"
```

MQTTメッセージ:
```
トピック: factory1/line1/temperature
メッセージ: {"value": 25.5, "unit": "celsius"}
```

InfluxDBデータポイント:
```
measurement: sensor
tags: 
  - topic: factory1/line1/temperature
  - factory: Manufacturing Plant A
  - line: Production Line 1
  - sensor: Temperature Sensor 001
  - asset_id: 550e8400-e29b-41d4-a716-446655440000
fields:
  - value: 25.5
  - unit: celsius
```

#### Asset情報が登録されていない場合

MQTTメッセージ:
```
トピック: factory1/line1/temperature
メッセージ: {"value": 25.5, "unit": "celsius"}
```

InfluxDBデータポイント:
```
measurement: factory1
tags: 
  - topic: factory1/line1/temperature
  - factory: factory1
  - line: line1
  - sensor: temperature
fields:
  - value: 25.5
  - unit: celsius
```

## クエリ例（SQL / FlightSQL）

### 最新のデータを取得
```sql
SELECT *
FROM telemetry."sensors"
WHERE time > now() - interval '1 hour'
ORDER BY time DESC
LIMIT 1;
```

### 特定の工場のデータを取得
```sql
SELECT time, value
FROM telemetry."sensors"
WHERE factory = 'Manufacturing Plant A'
  AND time > now() - interval '24 hours';
```

### 特定のラインのデータを取得
```sql
SELECT time, value
FROM telemetry."sensors"
WHERE line = 'Production Line 1'
  AND time > now() - interval '24 hours';
```

### 特定のアセットIDのデータを取得
```sql
SELECT time, value
FROM telemetry."sensors"
WHERE asset_id = '550e8400-e29b-41d4-a716-446655440000'
  AND time > now() - interval '24 hours';
```

### 特定のセンサーの時系列データ
```sql
SELECT time, value
FROM telemetry."sensors"
WHERE sensor = 'Temperature Sensor 001'
  AND time > now() - interval '24 hours';
```

### 工場とラインでグループ化して平均値を計算
```sql
SELECT factory, line, AVG(value) AS avg_value
FROM telemetry."sensors"
WHERE time > now() - interval '1 hour'
GROUP BY factory, line;
```

### 特定のセンサーの平均値を計算
```sql
SELECT AVG(value) AS avg_value
FROM telemetry."sensors"
WHERE sensor = 'Temperature Sensor 001'
  AND time > now() - interval '1 hour';
```

### アラート値以上のデータを検索
```sql
SELECT factory, line, sensor, time, value
FROM telemetry."sensors"
WHERE value > 100
  AND time > now() - interval '24 hours'
ORDER BY time DESC;
```

## トラブルシューティング

### 接続エラー（Write/Query）

1. **InfluxDBが起動しているか確認**
   ```bash
   # Dockerの場合
   docker ps | grep influxdb
   
   # システムサービスの場合
   sudo systemctl status influxdb
   ```

2. **ポートが開いているか確認**
   ```bash
# ローカル（Write API）
curl -s http://localhost:8086/health
   
# EC2（サーバ内から）
curl -s http://localhost:8086/health
   ```

3. **ファイアウォール設定**
   ```bash
   # Ubuntu/Debian
   sudo ufw allow 8086
   
   # Amazon Linux 2
   sudo firewall-cmd --permanent --add-port=8086/tcp
   sudo firewall-cmd --reload
   ```

### データが保存されない

1. **ログを確認**
   ```bash
   # アプリケーションログ
   tail -f backend/logs/app.log
   
   # InfluxDBログ
   docker logs influxdb
   # または
   sudo journalctl -u influxdb -f
   ```

2. **設定を確認**
  - Write API URL、Database 名、Token が正しいか
  - Database が存在するか

3. **手動でテスト**
   ```bash
# データ書き込みテスト (HTTP 8086)
curl -X POST "http://localhost:8086/api/v2/write?db=telemetry" \
  -H "Authorization: Token $INFLUX_TOKEN" \
  -H "Content-Type: text/plain" \
  --data-binary "test,location=local value=1i"
   ```

### データの一貫性の問題

1. **データ一貫性チェック**（本アプリ API）
   ```bash
   # APIエンドポイントでチェック
   curl http://localhost:3001/api/influxdb/consistency
   ```

2. **同じトピックで異なるタグ構造が使用されている場合**
   - Asset情報がデータベースに正しく登録されているか確認
   - Assetの階層構造（工場、ライン、センサー）が正しく設定されているか確認
   - データベース接続に問題がないか確認

3. **データの移行が必要な場合**
   - 既存のデータを削除して新しいタグ構造で再保存
   - または、InfluxDBのデータ移行ツールを使用

## セキュリティ

### 本番環境での推奨事項

1. **強力なパスワードとトークンを使用**
2. **HTTPSを有効にする**
3. **ファイアウォールでアクセスを制限**
4. **定期的なバックアップを設定**
5. **ログ監視を設定**

### HTTPS（Explorer）

```bash
# 証明書を配置
sudo mkdir -p /etc/influxdb/certs
sudo cp your-cert.pem /etc/influxdb/certs/
sudo cp your-key.pem /etc/influxdb/certs/

# Explorer 側で TLS を終端し、8086/8082 は内部限定で運用
```

## パフォーマンス最適化

1. **適切なバケット保持期間を設定**
2. **インデックスを最適化**
3. **定期的なデータ圧縮**
4. **モニタリングとアラートを設定**

## 参考リンク

- [InfluxDB 3 概要](https://docs.influxdata.com/influxdb3/)
- [FlightSQL/クエリ](https://docs.influxdata.com/influxdb3/query-data/sql/)
- [Explorer (Cloud/OSS UI)](https://docs.influxdata.com/influxdb3/cloud/tools/web-console/)

