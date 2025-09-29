# MQTT Backend Server

AWS IoT CoreへのMQTT接続をプロキシするNode.jsバックエンドサーバーです。

## 機能

- AWS IoT CoreへのSSL/TLS接続
- 証明書認証のサポート
- WebSocket経由でのフロントエンド通信
- 複数のMQTT接続の管理
- リアルタイムメッセージ転送

## セットアップ

### 1. 依存関係のインストール

```bash
cd backend
npm install
```

### 2. 環境変数の設定

```bash
cp env.example .env
```

`.env`ファイルを編集して必要な設定を行ってください。

### 3. 証明書ファイルの配置

`certificates/`フォルダに以下のファイルを配置してください：

```
certificates/
├── certificate.pem.crt    # デバイス証明書
├── private.pem.key        # プライベートキー
├── ca.crt                # CA証明書
└── README.md             # 説明ファイル
```

## 起動

### 開発モード

```bash
npm run dev
```

### 本番モード

```bash
npm start
```

サーバーは`http://localhost:3001`で起動します。

## API エンドポイント

### GET /api/health
サーバーの状態を確認

```json
{
  "status": "ok",
  "connections": 1
}
```

### GET /api/connections
現在のMQTT接続一覧を取得

```json
[
  {
    "id": "client_123_1234567890",
    "clientId": "client_123",
    "broker": "a1ve8krensecyj-ats.iot.us-west-2.amazonaws.com",
    "port": 8883,
    "status": "connected",
    "error": null
  }
]
```

## WebSocket通信

### 接続
```
ws://localhost:3001
```

### メッセージ形式

#### MQTT接続要求
```json
{
  "type": "connect",
  "config": {
    "broker": "a1ve8krensecyj-ats.iot.us-west-2.amazonaws.com",
    "port": 8883,
    "clientId": "test_client",
    "certificatePath": "certificates/certificate.pem.crt",
    "privateKeyPath": "certificates/private.pem.key",
    "caPath": "certificates/ca.crt"
  }
}
```

#### トピック購読
```json
{
  "type": "subscribe",
  "clientId": "test_client",
  "topic": "test/topic"
}
```

#### メッセージ送信
```json
{
  "type": "publish",
  "clientId": "test_client",
  "topic": "test/topic",
  "message": "Hello World"
}
```

#### 接続切断
```json
{
  "type": "disconnect",
  "clientId": "test_client"
}
```

## ログ

サーバーのログは以下の情報を含みます：

- MQTT接続の状態
- 受信したメッセージ
- エラー情報
- WebSocket接続の状態

## トラブルシューティング

### 接続エラー

1. **証明書ファイルの確認**
   - ファイルパスが正しいか確認
   - ファイルが存在するか確認
   - ファイルの権限を確認

2. **AWS IoT Core設定の確認**
   - エンドポイントが正しいか確認
   - デバイスがAWS IoT Coreに登録されているか確認
   - ポリシーが適切に設定されているか確認

3. **ネットワーク設定の確認**
   - ファイアウォール設定を確認
   - プロキシ設定を確認

### よくあるエラー

- `Certificate file not found`: 証明書ファイルのパスを確認
- `Private key file not found`: プライベートキーファイルのパスを確認
- `Connection error: ECONNREFUSED`: エンドポイントとポートを確認
- `Connection error: ENOTFOUND`: エンドポイントのDNS解決を確認

## セキュリティ

- 証明書ファイルは適切に保護してください
- 本番環境ではHTTPSを使用してください
- 環境変数で機密情報を管理してください 