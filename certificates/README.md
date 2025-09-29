# MQTT Certificates Directory

このフォルダにはMQTT接続に必要な証明書ファイルを配置してください。

## 必要なファイル

### AWS IoT Coreの場合
- `certificate.crt` - デバイス証明書
- `private.key` - プライベートキー
- `ca.crt` - AWS IoT Coreルート証明書（AmazonRootCA1.pem）

### 一般的なMQTTブローカーの場合
- `certificate.crt` - クライアント証明書
- `private.key` - プライベートキー
- `ca.crt` - CA証明書（オプション）

## ファイル配置例

```
certificates/
├── certificate.crt    # デバイス証明書
├── private.key        # プライベートキー
├── ca.crt            # CA証明書
└── README.md         # このファイル
```

## セキュリティ注意事項

1. **ファイル権限**: 証明書ファイルは適切な権限で保護してください
2. **バックアップ**: 証明書ファイルのバックアップを保持してください
3. **バージョン管理**: 証明書ファイルはGitにコミットしないでください
4. **環境変数**: 本番環境では環境変数を使用することを推奨します

## .gitignore設定

証明書ファイルをGitから除外するために、以下の行を`.gitignore`に追加してください：

```
certificates/*.crt
certificates/*.key
certificates/*.pem
!certificates/README.md
``` 