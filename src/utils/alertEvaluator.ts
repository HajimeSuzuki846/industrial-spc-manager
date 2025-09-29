import { Asset, AlertRule, AlertCondition, AlertAction } from '../types';
import { ZScoreCalculator, InfluxDBDataPoint } from './zscoreCalculator';
import { evaluateNotebookCondition } from './notebookApi';

export interface Alert {
  id: string;
  assetId: string;
  assetName: string;
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
  isActive: boolean;
  value?: number;
  threshold?: number;
  zscore?: number;
  zscoreDetails?: {
    currentValue: number;
    populationMean: number;
    populationStdDev: number;
    threshold: number;
  }
  notebookPath?: string;
  notebookUrl?: string;
}

export class AlertEvaluator {
  private activeAlerts: Map<string, Alert> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private assets: Asset[] = [];
  private lastExecutionTimes: Map<string, Date> = new Map();
  private ruleIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    // 定期的にアラートタイムアウトをチェック
    setInterval(() => {
      this.checkAlertTimeouts();
    }, 60000); // 1分ごと
  }

  // アセットを設定
  setAssets(assets: Asset[]) {
    this.assets = assets;
  }

  // アラートルールを設定
  setAlertRules(rules: AlertRule[]) {
    // 既存のタイマーをクリア
    this.clearAllRuleIntervals();
    
    this.alertRules.clear();
    rules.forEach(rule => {
      this.alertRules.set(rule.id, rule);
      // アクティブなルールのタイマーを開始
      if (rule.isActive) {
        this.startRuleInterval(rule);
      }
    });
  }

  // MQTTメッセージを評価してアラートを生成
  async evaluateMessage(topic: string, message: string, timestamp: Date): Promise<Alert[]> {
    const newAlerts: Alert[] = [];
    
    try {
      // MQTTメッセージをパース
      const data = this.parseMessage(message);
      if (!data) return newAlerts;

      // トピックからアセットを検索
      const asset = this.findAssetByTopic(topic);
      if (!asset) {
        console.log(`No asset found for topic: ${topic}`);
        return newAlerts;
      }

      // アセットのステータスをonlineに更新
      this.updateAssetStatus(asset.id, 'online', timestamp);

      // アセットに関連するアラートルールを評価（リアルタイムルールのみ）
      const assetRules = this.getAssetRules(asset.id);
      
      for (const rule of assetRules) {
        if (!rule.isActive) continue;
        
        // リアルタイムルールのみ評価
        if (rule.checkInterval === 0) {
          console.log(`Evaluating real-time rule ${rule.id} (${rule.name}) on MQTT message`);
          const alert = await this.evaluateRule(rule, asset, data, timestamp);
          if (alert) {
            newAlerts.push(alert);
          }
        } else {
          console.log(`Skipping periodic rule ${rule.id} (${rule.name}) on MQTT message`);
        }
      }

    } catch (error) {
      console.error('Error evaluating message:', error);
    }

    return newAlerts;
  }

  // アラートルールを評価
  private async evaluateRule(rule: AlertRule, asset: Asset, data: any, timestamp: Date): Promise<Alert | null> {
    try {
      // 最終実行日時を更新
      this.lastExecutionTimes.set(rule.id, timestamp);
      
      // 条件を評価（Zスコア条件も含む）
      let conditionsMet = true;
      let zscoreDetails: any = null;
      let notebookPath: string | undefined;
      let notebookUrl: string | undefined;

      for (const condition of rule.conditions || []) {
        const conditionResult = await this.evaluateCondition(condition, data, asset.id);
        
        // Zスコア条件の詳細情報を取得
        if (condition.type === 'zscore' && conditionResult) {
          zscoreDetails = await this.getZScoreDetails(condition, asset.id);
        }
        
        // Notebook条件のパスとURLを取得
        if (condition.type === 'notebook' && conditionResult) {
          notebookPath = condition.notebookConfig?.notebook;
          if (notebookPath) {
            // Notebookの実行URLを生成
            notebookUrl = `https://glicocmms-cbm-notebooks.org/notebooks/${notebookPath}`;
          }
        }
        
        if (!conditionResult) {
          conditionsMet = false;
          break;
        }
      }

      if (!conditionsMet) {
        // 条件を満たさない場合は既存のアラートを解決
        this.resolveAlert(rule.id, asset.id);
        return null;
      }

      // 既存のアラートがあるかチェック
      const alertKey = `${rule.id}_${asset.id}`;
      const existingAlert = this.activeAlerts.get(alertKey);

      if (existingAlert) {
        // 既存のアラートを更新
        existingAlert.timestamp = timestamp.toISOString();
        existingAlert.value = this.extractValue(rule.conditions?.[0]?.parameter, data);
        existingAlert.threshold = rule.conditions?.[0]?.value;
        if (zscoreDetails) {
          existingAlert.zscore = zscoreDetails.zscore;
          existingAlert.zscoreDetails = {
            currentValue: zscoreDetails.currentValue,
            populationMean: zscoreDetails.populationMean,
            populationStdDev: zscoreDetails.populationStdDev,
            threshold: zscoreDetails.threshold
          };
        }

        // Notebook情報を更新
        if (notebookPath) {
          existingAlert.notebookPath = notebookPath;
          existingAlert.notebookUrl = notebookUrl;
        }

        return existingAlert;
      }

      // 新しいアラートを作成
      const alert: Alert = {
        id: this.generateAlertId(),
        assetId: asset.id,
        assetName: asset.name,
        ruleId: rule.id,
        ruleName: rule.name,
        severity: 'warning', // デフォルト
        message: this.generateAlertMessage(rule, asset, data),
        timestamp: timestamp.toISOString(),
        isActive: true,
        value: this.extractValue(rule.conditions?.[0]?.parameter, data),
        threshold: rule.conditions?.[0]?.value,
        notebookPath: notebookPath,
        notebookUrl: notebookUrl
      };

      // アクティブなアラートに追加
      this.activeAlerts.set(alertKey, alert);

      // アセットのアラートステータスを更新
      this.updateAssetAlertStatus(asset, rule, alert);

      return alert;

    } catch (error) {
      console.error('Error evaluating rule:', error);
      return null;
    }
  }

  // 条件を評価
  private async evaluateCondition(condition: AlertCondition, data: any, assetId?: string): Promise<boolean> {
    // Notebook条件の評価
    if (condition.type === 'notebook' && condition.notebookConfig) {
      const result = await evaluateNotebookCondition(condition, data);

      // Notebookの実行履歴をアセットに保存
      if (assetId) {
        const asset = this.assets.find(a => a.id === assetId);
        if (asset) {
          const notebookPath = condition.notebookConfig.notebook;
          if (notebookPath) {
            asset.lastNotebookPath = notebookPath;
            asset.lastNotebookUrl = `https://glicocmms-cbm-notebooks.org/notebooks/${notebookPath}`;
            asset.lastNotebookExecutedAt = new Date();
          }
        }
      }

      return result;
    }

    // Zスコア条件の評価
    if (condition.type === 'zscore' && condition.zscoreConfig && assetId) {
      return await this.evaluateZScoreCondition(condition, assetId);
    }

    // シンプルな条件の評価
    const fieldValue = this.extractValue(condition.parameter, data);
    
    if (fieldValue === null || fieldValue === undefined) {
      return false;
    }

    const conditionValue = condition.value;
    const fieldValueNum = typeof fieldValue === 'string' ? parseFloat(fieldValue) : fieldValue;
    const conditionValueNum = typeof conditionValue === 'string' ? parseFloat(conditionValue) : conditionValue;

    switch (condition.operator) {
      case '>':
        return fieldValueNum > conditionValueNum;
      case '<':
        return fieldValueNum < conditionValueNum;
      case '=':
        return fieldValueNum === conditionValueNum;
      case '>=':
        return fieldValueNum >= conditionValueNum;
      case '<=':
        return fieldValueNum <= conditionValueNum;
      case '!=':
        return fieldValueNum !== conditionValueNum;
      default:
        return false;
    }
  }

  // Zスコア条件を評価
  private async evaluateZScoreCondition(condition: AlertCondition, assetId: string): Promise<boolean> {
    try {
      // InfluxDBからデータを取得
      const response = await fetch(`/api/influxdb/asset-data/${assetId}?field=${condition.parameter}&hours=${condition.zscoreConfig!.populationWindow * 24}`);
      
      if (!response.ok) {
        console.error('Failed to fetch asset data for Z-score calculation');
        return false;
      }

      const result = await response.json();
      if (!result.success || !result.data || result.data.length === 0) {
        console.log('No data available for Z-score calculation');
        return false;
      }

      // Zスコアを計算
      const zscoreResult = ZScoreCalculator.calculateZScore(result.data, condition.zscoreConfig!);
      
      if (!zscoreResult) {
        console.log('Z-score calculation failed');
        return false;
      }

      console.log('Z-score calculation result:', zscoreResult);
      return zscoreResult.isAnomaly;
    } catch (error) {
      console.error('Error evaluating Z-score condition:', error);
      return false;
    }
  }

  // Zスコア詳細情報を取得
  private async getZScoreDetails(condition: AlertCondition, assetId: string): Promise<any> {
    try {
      const response = await fetch(`/api/influxdb/asset-data/${assetId}?field=${condition.parameter}&hours=${condition.zscoreConfig!.populationWindow * 24}`);
      
      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      if (!result.success || !result.data || result.data.length === 0) {
        return null;
      }

      return ZScoreCalculator.calculateZScore(result.data, condition.zscoreConfig!);
    } catch (error) {
      console.error('Error getting Z-score details:', error);
      return null;
    }
  }

  // データから値を抽出
  private extractValue(field: string, data: any): any {
    if (!field) return null;

    // ドット記法でネストした値を取得 "sensor.temperature"など
    const fieldParts = field.split('.');
    let value = data;

    for (const part of fieldParts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }

    return value;
  }

  // MQTTメッセージをパース
  private parseMessage(message: string): any {
    try {
      return JSON.parse(message);
    } catch (error) {
      // JSONでない場合は数値として解析を試行
      const numValue = parseFloat(message);
      return isNaN(numValue) ? { value: message } : { value: numValue };
    }
  }

  // トピックからアセットを検索
  private findAssetByTopic(topic: string): Asset | null {
    return this.assets.find(asset => asset.mqttTopic === topic) || null;
  }

  // アセットのステータスを更新
  private updateAssetStatus(assetId: string, status: 'online' | 'offline' | 'warning' | 'error', timestamp: Date) {
    const asset = this.assets.find(a => a.id === assetId);
    if (asset) {
      asset.status = status;
      asset.lastUpdate = timestamp;
      console.log(`Asset ${asset.name} (${assetId}) status updated to: ${status}`);
    }
  }

  // アセットのルールを取得
  private getAssetRules(assetId: string): AlertRule[] {
    return Array.from(this.alertRules.values()).filter(rule => 
      rule.assetId === assetId
    );
  }

  // アラートメッセージを生成
  private generateAlertMessage(rule: AlertRule, asset: Asset, data: any): string {
    const condition = rule.conditions?.[0];
    if (!condition) return `${asset.name}: アラート条件が設定されていません`;

    const value = this.extractValue(condition.parameter, data);
    const operatorText = this.getOperatorText(condition.operator);
    
    return `${asset.name}: ${condition.parameter}${operatorText}${condition.value} (現在値: ${value})`;
  }

  // 演算子をテキストに変換
  private getOperatorText(operator: string): string {
    switch (operator) {
      case '>': return ' > ';
      case '<': return ' < ';
      case '=': return ' = ';
      case '>=': return ' >= ';
      case '<=': return ' <= ';
      case '!=': return ' != ';
      default: return '';
    }
  }

  // アラートを解決
  private resolveAlert(ruleId: string, assetId: string) {
    const alertKey = `${ruleId}_${assetId}`;
    const alert = this.activeAlerts.get(alertKey);
    
    if (alert) {
      alert.isActive = false;
      
      // アセットのアラートステータスをクリア
      this.clearAssetAlertStatus(assetId);
      
      // 一定時間後にアラートを削除
      setTimeout(() => {
        this.activeAlerts.delete(alertKey);
      }, 30000); // 30秒後
    }
  }

  // アラートタイムアウトをチェック
  private checkAlertTimeouts() {
    const now = new Date();
    const timeoutThreshold = 30 * 60 * 1000; // 30分
    for (const [key, alert] of this.activeAlerts.entries()) {
      const alertTime = new Date(alert.timestamp);
      if (now.getTime() - alertTime.getTime() > timeoutThreshold) {
        this.activeAlerts.delete(key);
      }
    }
  }

  // アラートIDを生成
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // アクティブなアラートを取得
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => alert.isActive);
  }

  // ルールの最終実行日時を取得
  getLastExecutionTime(ruleId: string): Date | null {
    return this.lastExecutionTimes.get(ruleId) || null;
  }

  // アセットのアラートを取得
  getAssetAlerts(assetId: string): Alert[] {
    return this.getActiveAlerts().filter(alert => alert.assetId === assetId);
  }

  // アラートを手動で解決
  resolveAlertById(alertId: string) {
    const alert = Array.from(this.activeAlerts.values()).find(a => a.id === alertId);
    if (alert) {
      this.resolveAlert(alert.ruleId, alert.assetId);
    }
  }

  // ルールの定期実行を開始
  private startRuleInterval(rule: AlertRule) {
    // 既存のタイマーをクリア
    this.clearRuleInterval(rule.id);
    
    // リアルタイムルールは定期実行しない
    if (rule.checkInterval === 0) {
      console.log(`Skipping periodic execution for real-time rule ${rule.id} (${rule.name})`);
      return;
    }
    
    const interval = rule.checkInterval || 0; // デフォルト値
    console.log(`Starting periodic execution for rule ${rule.id} (${rule.name}) with interval ${interval}s`);
    
    const timer = setInterval(async () => {
      await this.executeRulePeriodically(rule);
    }, interval * 1000);
    
    this.ruleIntervals.set(rule.id, timer);
  }

  // ルールの定期実行を停止
  private clearRuleInterval(ruleId: string) {
    const timer = this.ruleIntervals.get(ruleId);
    if (timer) {
      clearInterval(timer);
      this.ruleIntervals.delete(ruleId);
      console.log(`Stopped periodic execution for rule ${ruleId}`);
    }
  }

  // すべてのルールタイマーをクリア
  private clearAllRuleIntervals() {
    this.ruleIntervals.forEach((timer, ruleId) => {
      clearInterval(timer);
      console.log(`Cleared interval for rule ${ruleId}`);
    });
    this.ruleIntervals.clear();
  }

  // ルールを定期実行
  private async executeRulePeriodically(rule: AlertRule) {
    try {
      console.log(`Executing rule ${rule.id} (${rule.name}) periodically`);
      
      // ルールに関連するアセットを検索
      const asset = this.assets.find(a => a.id === rule.assetId);
      if (!asset) {
        console.log(`Asset not found for rule ${rule.id}`);
        return;
      }

      // 最新のデータをInfluxDBから取得
      const latestData = await this.getLatestAssetData(asset.id);
      if (!latestData) {
        console.log(`No data available for asset ${asset.id}`);
        return;
      }

      // ルールを評価
      const alert = await this.evaluateRule(rule, asset, latestData, new Date());
      if (alert) {
        console.log(`Alert triggered by periodic execution: ${alert.message}`);
        // アラートが発火した場合の処理は既にevaluateRule内で実行済み
      }

    } catch (error) {
      console.error(`Error executing rule ${rule.id} periodically:`, error);
    }
  }

  // アセットの最新データを取得
  private async getLatestAssetData(assetId: string): Promise<any> {
    try {
      const response = await fetch(`/api/influxdb/asset-data/${assetId}?field=value&hours=1&limit=1`);
      if (!response.ok) {
        return null;
      }
      
      const result = await response.json();
      if (result.success && result.data && result.data.length > 0) {
        return { value: result.data[0].value };
      }

      return null;
    } catch (error) {
      console.error('Error fetching latest asset data:', error);
      return null;
    }
  }

  // ルールのステータスを更新（アクティブ/非アクティブ）
  updateRuleStatus(ruleId: string, isActive: boolean) {
    const rule = this.alertRules.get(ruleId);
    if (rule) {
      rule.isActive = isActive;
      
      if (isActive) {
        this.startRuleInterval(rule);
      } else {
        this.clearRuleInterval(ruleId);
      }
    }
  }

  // ルールを更新
  updateRule(rule: AlertRule) {
    this.alertRules.set(rule.id, rule);
    
    // 既存のタイマーをクリア
    this.clearRuleInterval(rule.id);
    
    // アクティブな場合は新しいタイマーを開始
    if (rule.isActive) {
      this.startRuleInterval(rule);
    }
  }

  // アセットのアラートステータスを更新
  private updateAssetAlertStatus(asset: Asset, rule: AlertRule, alert: Alert) {
    // アセットのアラートステータスを更新
    asset.isAlertActive = true;
    asset.activeAlertRule = rule.id;
    asset.alertTriggeredAt = new Date();
    
    // Notebook情報を設定
    if (alert.notebookPath) {
      asset.activeAlertNotebookPath = alert.notebookPath;
      asset.activeAlertNotebookUrl = alert.notebookUrl;
    }
    
    console.log(`Asset ${asset.name} alert status updated:`, {
      isAlertActive: asset.isAlertActive,
      activeAlertRule: asset.activeAlertRule,
      alertTriggeredAt: asset.alertTriggeredAt,
      notebookPath: asset.activeAlertNotebookPath,
      notebookUrl: asset.activeAlertNotebookUrl
    });
  }

  // アセットのアラートステータスをクリア
  clearAssetAlertStatus(assetId: string) {
    const asset = this.assets.find(a => a.id === assetId);
    if (asset) {
      asset.isAlertActive = false;
      asset.activeAlertRule = undefined;
      asset.alertTriggeredAt = undefined;
      asset.activeAlertNotebookPath = undefined;
      asset.activeAlertNotebookUrl = undefined;
      
      console.log(`Asset ${asset.name} alert status cleared`);
    }
  }
}

// シングルトンインスタンス
export const alertEvaluator = new AlertEvaluator();







