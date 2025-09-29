# AWS IoT Core 接続設定ガイド

## 概要

このガイドでは、AWS IoT CoreにMQTT接続するための設定手順を説明します。

## 前提条件

1. AWS IoT Coreのエンドポイント
2. デバイス証明書（.crt）
3. プライベートキー（.key）
4. AWS IoT Coreルート証明書（AmazonRootCA1.pem）

## 設定手順

### 1. 証明書ファイルの配置

`certificates/`フォルダに以下のファイルを配置してください：

```
certificates/
├── certificate.crt    # デバイス証明書
├── private.key        # プライベートキー
├── ca.crt            # AWS IoT Coreルート証明書
└── README.md         # 説明ファイル
```

### 2. MQTT設定

アプリケーションで以下の設定を行ってください：

```
Broker: a1ve8krensecyj-ats.iot.us-west-2.amazonaws.com
Port: 8883
Client ID: your-unique-client-id
Certificate File: certificates/certificate.crt
Private Key File: certificates/private.key
CA Certificate File: certificates/ca.crt
```

### 3. AWS IoT Coreポリシーの設定

AWS IoT Coreコンソールで、デバイスに適切なポリシーを設定してください：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iot:Connect",
        "iot:Publish",
        "iot:Subscribe",
        "iot:Receive"
      ],
      "Resource": [
        "*"
      ],
      "Condition": {
        "StringEquals": {
          "iot:ClientId": "your-unique-client-id"
        }
      }
    }
  ]
}
```

## 接続テスト

### 1. ローカルテスト

```bash
# Mosquittoクライアントを使用したテスト
mosquitto_pub -h a1ve8krensecyj-ats.iot.us-west-2.amazonaws.com \
  -p 8883 \
  --cafile certificates/ca.crt \
  --cert certificates/certificate.crt \
  --key certificates/private.key \
  -t "test/topic" \
  -m "Hello AWS IoT Core"
```

### 2. アプリケーションでのテスト

1. MQTT設定画面で証明書ファイルのパスを設定
2. 接続ボタンをクリック
3. 接続状態を確認
4. メッセージの送受信をテスト

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

## セキュリティ注意事項

1. **証明書ファイルの保護**
   - 証明書ファイルは適切な権限で保護
   - バックアップを保持
   - Gitにコミットしない

2. **Client IDの管理**
   - 一意のClient IDを使用
   - 定期的に更新

3. **ポリシーの最小権限原則**
   - 必要最小限の権限のみを付与
   - 定期的にポリシーをレビュー

## 参考リンク

- [AWS IoT Core 開発者ガイド](https://docs.aws.amazon.com/iot/latest/developerguide/)
- [AWS IoT Core 証明書管理](https://docs.aws.amazon.com/iot/latest/developerguide/x509-certs.html)
- [AWS IoT Core ポリシー](https://docs.aws.amazon.com/iot/latest/developerguide/iot-policies.html) 