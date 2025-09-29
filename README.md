# Industrial Asset Alert Management

産業用アセットの監視とアラート管理システム

## 概要

このシステムは、産業用アセット（センサー、アクチュエーター、モーターなど）のリアルタイム監視とアラート管理を行うWebアプリケーションです。

## 機能

- **アセット監視**: 階層構造でのアセット管理
- **リアルタイムデータ**: MQTT経由でのリアルタイムデータ受信
- **時系列データ蓄積**: InfluxDBへの自動データ保存
- **アラート管理**: 条件ベースのアラートルール設定
- **管理者設定**: MQTT、データベース、InfluxDB設定の管理

## 管理者メニュー

通常のユーザーはアセットの監視とアラート設定のみを行いますが、管理者は以下の設定にアクセスできます：

### アクセス方法
1. アプリケーション右上のシールドアイコン（🛡️）をクリック
2. 管理者パスワードを入力
3. MQTT設定またはデータベース設定タブを選択

### 設定項目
- **MQTT設定**: ブローカー接続設定、証明書認証
- **データベース設定**: PostgreSQL接続設定
- **InfluxDB設定**: 時系列データベース接続設定

## 環境設定

### 管理者パスワード
`backend/.env`ファイルで管理者パスワードを設定できます：

```env
ADMIN_PASSWORD=your_admin_password
```

初期値: `Glico2030`

### データベース設定
PostgreSQLデータベースの接続設定：

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=asset_manager
DB_USER=postgres
DB_PASSWORD=your_password
```

**初回起動時の自動接続**: サーバー起動時に環境変数からPostgreSQL設定を自動的に読み込み、接続を試行します。デフォルトパスワードは `Glico2030` です。

### InfluxDB設定
時系列データベースの接続設定（デフォルト値）：

```
URL: http://localhost:8086
Username: admin
Password: Glico2030
Organization: glico
Bucket: telemetry
Token: SuperSecretToken
```

これらの設定は管理者画面から変更できます。

## セットアップ

1. 依存関係のインストール
```bash
npm install
cd backend && npm install
```

2. 環境変数の設定
```bash
cp backend/env.example backend/.env
# .envファイルを編集して設定を変更
```

**重要**: PostgreSQLの接続設定を環境変数に追加してください：
```env
# PostgreSQLデータベース設定
DB_HOST=localhost
DB_PORT=5432
DB_NAME=asset_manager
DB_USER=postgres
DB_PASSWORD=your_actual_password
```

3. データベースの準備
- PostgreSQLをインストール
- データベースを作成

4. InfluxDBの準備（オプション）
- InfluxDB 2.7をインストール
- 詳細は `INFLUXDB_SETUP.md` を参照
- または、提供されているセットアップスクリプトを使用：
  ```bash
  # Linux/Mac
  chmod +x setup-influxdb.sh
  ./setup-influxdb.sh
  
  # Windows PowerShell
  .\setup-influxdb.ps1
  ```

5. アプリケーションの起動
```bash
# バックエンド
cd backend && npm start

# フロントエンド（別ターミナル）
npm run dev
```

## 使用方法

1. アプリケーションにアクセス
2. 左側のアセットツリーから監視したいアセットを選択
3. アセット詳細画面でアラートルールを設定
4. リアルタイムデータを監視

## 管理者向け機能

- MQTTブローカー設定の変更
- データベース接続設定の変更
- InfluxDB接続設定の変更
- 証明書ファイルの管理

通常のユーザーはこれらの設定を変更する必要はありません。

## 時系列データ蓄積

MQTTで受信したデータは自動的にInfluxDBに時系列データとして保存されます：

- **自動保存**: MQTTメッセージを受信するたびに自動保存
- **構造化データ**: トピック構造に基づいてタグ付け
- **効率的なクエリ**: 時系列データの高速検索・集計
- **長期保存**: 大量の時系列データの効率的な管理

詳細な設定方法は `INFLUXDB_SETUP.md` を参照してください。
