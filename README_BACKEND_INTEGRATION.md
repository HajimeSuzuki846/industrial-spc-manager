# MQTT Backend Integration Guide

AWS IoT CoreへのMQTT接続を実現するためのNode.jsバックエンドサーバーの統合ガイドです。

## 概要

ブラウザ環境では直接AWS IoT CoreにSSL/TLS接続できないため、Node.jsバックエンドサーバーをプロキシとして使用します。

## アーキテクチャ

```
[Browser] ←→ [WebSocket] ←→ [Node.js Backend] ←→ [SSL/TLS] ←→ [AWS IoT Core]
```

## セットアップ手順

### 1. バックエンドサーバーのセットアップ

```bash
# バックエンドディレクトリに移動
cd backend

# 依存関係をインストール
npm install

# 環境変数を設定
cp env.example .env
```

### 2. 証明書ファイルの配置

`certificates/`フォルダにAWS IoT Coreの証明書ファイルを配置：

```
certificates/
├── c164c30eca2f6b14a4ed63c8a0f92f8e24064baa911a12dc6772e0374848b14c-certificate.pem.crt
├── c164c30eca2f6b14a4ed63c8a0f92f8e24064baa911a12dc6772e0374848b14c-private.pem.key
├── ca.crt
└── README.md
```

### 3. バックエンドサーバーの起動

```bash
# 開発モードで起動
npm run dev

# または本番モードで起動
npm start
```

サーバーは`http://localhost:3001`で起動します。

### 4. フロントエンドの起動

```bash
# プロジェクトルートに戻る
cd ..

# フロントエンドをビルド
npm run build

# または開発モードで起動
npm run dev
```

## 設定

### AWS IoT Core設定

フロントエンドで以下の設定を使用：

```
Broker: a1ve8krensecyj-ats.iot.us-west-2.amazonaws.com
Port: 8883
Client ID: your-unique-client-id
Certificate File: certificates/c164c30eca2f6b14a4ed63c8a0f92f8e24064baa911a12dc6772e0374848b14c-certificate.pem.crt
Private Key File: certificates/c164c30eca2f6b14a4ed63c8a0f92f8e24064baa911a12dc6772e0374848b14c-private.pem.key
CA Certificate File: certificates/ca.crt
```

## 動作確認

### 1. バックエンドサーバーの確認

```bash
curl http://localhost:3001/api/health
```

期待される応答：
```json
{
  "status": "ok",
  "connections": 0
}
```

### 2. 接続状態の確認

```bash
curl http://localhost:3001/api/connections
```

### 3. フロントエンドでの接続テスト

1. ブラウザでアプリケーションにアクセス
2. MQTT設定画面で設定を入力
3. 接続ボタンをクリック
4. 接続状態を確認

## トラブルシューティング

### バックエンドサーバーが起動しない

1. **ポートの確認**
   ```bash
   netstat -an | findstr :3001
   ```

2. **依存関係の確認**
   ```bash
   cd backend
   npm install
   ```

3. **ログの確認**
   ```bash
   npm run dev
   ```

### MQTT接続エラー

1. **証明書ファイルの確認**
   - ファイルが存在するか確認
   - ファイルパスが正しいか確認

2. **AWS IoT Core設定の確認**
   - エンドポイントが正しいか確認
   - デバイスが登録されているか確認
   - ポリシーが設定されているか確認

3. **ネットワーク設定の確認**
   - ファイアウォール設定を確認
   - プロキシ設定を確認

### WebSocket接続エラー

1. **バックエンドサーバーの確認**
   - サーバーが起動しているか確認
   - ポート3001が開いているか確認

2. **CORS設定の確認**
   - ブラウザの開発者ツールでエラーを確認

## 開発

### バックエンドの開発

```bash
cd backend
npm run dev
```

### フロントエンドの開発

```bash
npm run dev
```

### 同時起動

```bash
# ターミナル1: バックエンド
cd backend && npm run dev

# ターミナル2: フロントエンド
npm run dev
```

## 本番環境

### デプロイ

1. **バックエンドのデプロイ**
   - Node.jsサーバーを本番環境にデプロイ
   - 環境変数を設定
   - 証明書ファイルを配置

2. **フロントエンドのデプロイ**
   - ビルドファイルをWebサーバーにデプロイ
   - バックエンドのURLを更新

### セキュリティ

1. **HTTPSの使用**
   - 本番環境ではHTTPSを使用
   - WebSocket Secure (WSS) を使用

2. **証明書の管理**
   - 証明書ファイルを安全に管理
   - 定期的な更新

3. **アクセス制御**
   - 適切な認証・認可を実装
   - レート制限を設定

## 参考

- [AWS IoT Core 開発者ガイド](https://docs.aws.amazon.com/iot/latest/developerguide/)
- [MQTT.js ドキュメント](https://github.com/mqttjs/MQTT.js)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) 