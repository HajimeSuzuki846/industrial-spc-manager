# MQTT Implementation Guide

## 現在の実装状況

### 修正された問題
- **問題**: MQTTの設定が適当でもConnectedになってダミーデータが更新される
- **解決**: 実際のMQTT接続を実装し、接続が成功した場合のみConnected状態になるように修正

### 実装された機能

#### 1. 実際のMQTT接続
- mqtt.jsライブラリを使用した実際のMQTT接続
- 自動再接続機能
- 接続状態の監視
- エラーハンドリング

#### 2. 接続検証
- Broker URLの形式検証
- ポート番号の範囲検証（1-65535）
- 認証情報の整合性チェック
- 接続エラーの詳細表示

#### 3. エラーハンドリング
- 接続エラーメッセージの表示
- 接続状態の視覚的フィードバック
- コンソールでのエラーログ出力
- 再接続の自動化

#### 4. バリデーション機能
- Broker URLの正規表現パターンマッチング
- 一般的なMQTTポート番号の警告
- 必須フィールドの検証

#### 5. 接続管理
- 手動切断機能
- 接続状態の監視
- クリーンアップ機能

## 実装されたMQTT機能

### 接続オプション
```typescript
const options: mqtt.IClientOptions = {
  clientId: config.clientId,
  clean: true,
  reconnectPeriod: 1000,
  connectTimeout: 30000,
  rejectUnauthorized: false, // For development
};
```

### サポートされるプロトコル
- `mqtt://` - 標準MQTT接続
- `mqtts://` - SSL/TLS暗号化MQTT接続（ポート8883）
- `ws://` - WebSocket接続
- `wss://` - 暗号化WebSocket接続

### イベントハンドリング
- `connect` - 接続成功
- `message` - メッセージ受信
- `error` - 接続エラー
- `close` - 接続終了
- `reconnect` - 再接続試行
- `offline` - オフライン状態

## テスト方法

### 1. ローカルMQTTブローカーでのテスト
```bash
# Mosquitto MQTTブローカーのインストール（Ubuntu/Debian）
sudo apt-get install mosquitto mosquitto-clients

# ブローカーの起動
sudo systemctl start mosquitto

# テスト用のメッセージ送信
mosquitto_pub -h localhost -t "factory1/line1/temperature" -m "25.5"
```

### 2. 有効な設定でのテスト
```
Broker: localhost
Port: 1883
Client ID: test_client
```

### 3. 無効な設定でのテスト
```
Broker: invalid
Port: 9999
Client ID: test_client
```

### 4. 認証エラーのテスト
```
Broker: localhost
Port: 1883
Client ID: test_client
Username: test_user
Password: (空)
```

## 使用可能なMQTTブローカー

### 1. ローカル開発用
- **Mosquitto**: 軽量で使いやすい
- **Eclipse HiveMQ**: 機能豊富
- **RabbitMQ**: エンタープライズ向け

### 2. クラウドサービス
- **AWS IoT Core**: AWS統合
- **Azure IoT Hub**: Microsoft統合
- **Google Cloud IoT**: Google統合
- **HiveMQ Cloud**: マネージドサービス

## セキュリティ考慮事項

### 1. 認証
- ユーザー名/パスワード認証
- 証明書ベース認証（TLS/SSL）
- JWT認証

### 2. 暗号化
- TLS/SSL接続（ポート8883）
- WebSocket Secure（WSS）

### 3. アクセス制御
- トピックレベルの権限管理
- クライアントIDの一意性確保

## パフォーマンス最適化

### 1. 接続管理
- 接続プーリング
- 自動再接続
- 接続タイムアウト設定

### 2. メッセージ処理
- QoS設定の最適化
- メッセージの永続化
- バッチ処理

### 3. リソース管理
- メモリ使用量の監視
- 接続数の制限
- クリーンアップ処理

## トラブルシューティング

### 1. 接続エラー
- ブローカーの起動確認
- ファイアウォール設定
- ポート番号の確認

### 2. 認証エラー
- ユーザー名/パスワードの確認
- 証明書の有効性確認
- 権限設定の確認

### 3. メッセージ受信エラー
- トピックの購読確認
- QoS設定の確認
- ネットワーク接続の確認

## 次のステップ

### 1. 本番環境対応
- セキュリティ強化
- ログ機能の追加
- 監視機能の実装

### 2. 機能拡張
- トピック管理機能
- メッセージ履歴
- アラート機能

### 3. 統合
- データベース連携
- 外部API連携
- ダッシュボード統合

## 注意事項

1. **開発環境**: `rejectUnauthorized: false`は開発環境でのみ使用
2. **本番環境**: 適切な認証・暗号化を実装
3. **パフォーマンス**: 大量のメッセージ処理時の最適化を検討
4. **セキュリティ**: 定期的なセキュリティ監査を実施 