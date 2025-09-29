export interface Factory {
  id: string;
  name: string;
  lines: ProductionLine[];
}

export interface ProductionLine {
  id: string;
  name: string;
  factoryId: string;
  assets: Asset[];
}

export type AssetType = 'sensor' | 'actuator' | 'controller' | 'motor' | 'pump' | 'valve' | 'conveyor' | 'robot' | 'camera' | 'other';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  lineId: string;
  status: 'online' | 'offline' | 'warning' | 'error';
  // データソース設定（MQTTのみサポート）
  dataSourceType: 'mqtt';
  mqttTopic?: string;
  lastValue?: number;
  lastUpdate?: Date;
  alertRules: AlertRule[];
  hasUnsavedChanges?: boolean;
  // アラート状態を管理
  isAlertActive?: boolean;
  activeAlertRule?: string; // 発火中のアラートルールID
  alertTriggeredAt?: Date; // アラート発火時刻
  activeAlertNotebookPath?: string; // 発火中のNotebookパス
  activeAlertNotebookUrl?: string; // 発火中のNotebook URL
  // 直近に実行したNotebook情報（アラート非発火時も保持）
  lastNotebookPath?: string;
  lastNotebookUrl?: string;
  lastNotebookExecutedAt?: Date;
  // センサータグ（ラベルとMQTTキーの対応）
  // unit, note は任意のメモ用フィールド
  // tagType: 'analog'（アナログ値） | 'cumulative'（積算値）
  tags?: {
    tagId?: string; // タグ固有のUUID
    label: string;
    key: string;
    unit?: string;
    note?: string;
    tagType?: 'analog' | 'cumulative';
    resetHistory?: { timestamp: string; value: number | string }[]; // リセット履歴（時刻とその時の値）
  }[];
}

export interface AlertRule {
  id: string;
  name: string;
  assetId: string;
  conditions: AlertCondition[];
  actions: AlertAction[];
  isActive: boolean;
  checkInterval?: number; // チェック頻度（秒単位、デフォルト300秒=5分）
}

export interface AlertCondition {
  id: string;
  type: 'simple' | 'zscore' | 'notebook'; // 条件タイプを追加
  parameter: string;
  operator: '>' | '<' | '=' | '>=' | '<=' | '!=';
  value: number;
  logicalOperator?: 'AND' | 'OR';
  // Zスコア条件用の追加プロパティ
  zscoreConfig?: {
    movingAverageWindow: number; // 移動平均ウィンドウ（分）
    populationWindow: number;    // 母集団ウィンドウ（日）
    threshold: number;           // Zスコア閾値
  };
  // Notebook条件用の追加プロパティ
  notebookConfig?: {
    notebook: string;            // ノートブックファイル名
    parameters: Record<string, any>; // パラメータ
    executionTime?: number;      // 標準実行時間（ミリ秒）
    maxRetries?: number;         // 最大リトライ回数
  };
}

export interface AlertAction {
  id: string;
  type: 'mqtt' | 'email' | 'webhook';
  config: {
    topic?: string;
    message?: string;
    url?: string;
  };
}

export interface MQTTConfig {
  broker: string;
  port: number;
  username?: string;
  password?: string;
  clientId: string;
  // 証明書認証用の設定を追加
  certificatePath?: string;
  privateKeyPath?: string;
  caPath?: string;
  // 証明書の内容を直接保存（ブラウザ環境用）
  certificateContent?: string;
  privateKeyContent?: string;
  caContent?: string;
  // データベース関連のフィールド（オプション）
  id?: number;
  created_at?: string;
  updated_at?: string;
}

export interface DragItem {
  id: string;
  type: 'condition' | 'action' | 'operator';
  content: any;
}

// Thingsboard関連の型は削除されました