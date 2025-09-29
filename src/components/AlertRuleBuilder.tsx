import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Pause, Save, TestTube, X, ExternalLink } from 'lucide-react';
import { AlertRule, AlertCondition, AlertAction } from '../types';
import { evaluateNotebookCondition } from '../utils/notebookApi';
import { alertEvaluator } from '../utils/alertEvaluator';

interface AlertRuleBuilderProps {
  rule: AlertRule;
  onRuleUpdate: (rule: AlertRule) => void;
  onSave?: (ruleId: string) => void;
  onCancel?: () => void;
  isEditMode?: boolean;
  ruleIndex?: number;
  mqttMessages?: Record<string, any>; // MQTTメッセージを追加
  assetTags?: { label: string; key: string }[]; // 追加: アセットのタグ
}

export const AlertRuleBuilder: React.FC<AlertRuleBuilderProps> = ({
  rule,
  onRuleUpdate,
  onSave,
  onCancel,
  isEditMode = false,
  ruleIndex = 1,
  mqttMessages = {}, // デフォルト値を設定
  assetTags = []
}) => {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testDetails, setTestDetails] = useState<{
    resultValue?: any;
    resultType?: string;
    parameter?: string;
    operator?: string;
    threshold?: any;
    thresholdType?: string;
    evaluationResult?: boolean;
    evaluationExpression?: string;
  } | null>(null);
  const [lastExecutionTime, setLastExecutionTime] = useState<Date | null>(null);

  // アラート評価エンジンから最終実行日時を取得
  useEffect(() => {
    const executionTime = alertEvaluator.getLastExecutionTime(rule.id);
    if (executionTime) {
      setLastExecutionTime(executionTime);
    }
  }, [rule.id]);

  const operators = ['>', '<', '=', '>=', '<=', '!='];
  const logicalOperators = ['AND', 'OR'];
  const actionTypes = ['mqtt', 'email', 'webhook'];
  const checkIntervals = [
    { value: 0, label: 'リアルタイム（都度）' },
    { value: 60, label: '1分' },
    { value: 300, label: '5分' },
    { value: 600, label: '10分' },
    { value: 1800, label: '30分' },
    { value: 3600, label: '1時間' },
    { value: 7200, label: '2時間' }
  ];

  // Zスコア設定用のオプション
  const movingAverageOptions = [
    { value: 5, label: '5分' },
    { value: 10, label: '10分' },
    { value: 15, label: '15分' },
    { value: 30, label: '30分' },
    { value: 60, label: '1時間' }
  ];

  const populationWindowOptions = [
    { value: 7, label: '1週間' },
    { value: 14, label: '2週間' },
    { value: 21, label: '3週間' },
    { value: 28, label: '4週間' },
    { value: 60, label: '2ヶ月' }
  ];

  const zscoreThresholdOptions = [
    { value: 1.5, label: '1.5σ' },
    { value: 2.0, label: '2.0σ' },
    { value: 2.5, label: '2.5σ' },
    { value: 3.0, label: '3.0σ' }
  ];

  const addCondition = () => {
    const newCondition: AlertCondition = {
      id: Date.now().toString(),
      type: 'simple',
      parameter: 'value',
      operator: '>',
      value: 0,
      logicalOperator: rule.conditions.length > 0 ? 'AND' : undefined
    };

    onRuleUpdate({
      ...rule,
      conditions: [...rule.conditions, newCondition]
    });
    setHasUnsavedChanges(true);
  };

  const addZScoreCondition = () => {
    const newCondition: AlertCondition = {
      id: Date.now().toString(),
      type: 'zscore',
      parameter: 'value',
      operator: '>',
      value: 0,
      logicalOperator: rule.conditions.length > 0 ? 'AND' : undefined,
      zscoreConfig: {
        movingAverageWindow: 15,
        populationWindow: 28,
        threshold: 2.0
      }
    };

    onRuleUpdate({
      ...rule,
      conditions: [...rule.conditions, newCondition]
    });
    setHasUnsavedChanges(true);
  };

  const addNotebookCondition = () => {
    const newCondition: AlertCondition = {
      id: Date.now().toString(),
      type: 'notebook',
      parameter: 'result',
      operator: '>',
      value: 0,
      logicalOperator: rule.conditions.length > 0 ? 'AND' : undefined,
      notebookConfig: {
        notebook: 'kpi_monthly.ipynb',
        parameters: {
          target_date: new Date().toISOString().split('T')[0],
          threshold: 2.5,
          top_n: 50
        },
        executionTime: 30000, // 30秒
        maxRetries: 3
      }
    };

    onRuleUpdate({
      ...rule,
      conditions: [...rule.conditions, newCondition]
    });
    setHasUnsavedChanges(true);
  };

  // 最新のMQTTデータを取得する関数（InfluxDBの代わりにMQTTメッセージを使用）
  const getLatestMQTTData = (assetId: string): any => {
    // アセットのMQTTトピックを取得（実際のアセット情報が必要）
    // ここでは、rule.assetIdに対応するMQTTトピックを探す
    // 実際の実装では、アセット情報からMQTTトピックを取得する必要がある
    
    // 現在のmqttMessagesから該当するデータを探す
    for (const [topic, messageData] of Object.entries(mqttMessages)) {
      // トピックからアセットIDを推測するか、メッセージデータから判断
      if (messageData && messageData.value) {
        console.log(`MQTTデータを確認中 - トピック: ${topic}`, messageData);
        return messageData;
      }
    }
    
    console.warn('該当するMQTTデータが見つかりません');
    return null;
  };

  // ネストされたオブジェクトから値を取得する関数
  const getNestedValue = (obj: any, path: string): any => {
    if (!obj || !path) return null;
    
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return null;
      }
    }
    
    return current;
  };

  // シンプル条件を評価する関数
  const evaluateSimpleCondition = (condition: AlertCondition, data: any): boolean => {
    // ネストされたパスに対応（例: "value.adc_avg"）
    const fieldValue = getNestedValue(data, condition.parameter);
    
    console.log('条件評価詳細:', {
      parameter: condition.parameter,
      fieldValue,
      operator: condition.operator,
      threshold: condition.value,
      data
    });
    
    if (fieldValue === null || fieldValue === undefined) {
      console.log('フィールド値が見つかりません:', condition.parameter);
      return false;
    }

    const conditionValue = condition.value;
    const fieldValueNum = typeof fieldValue === 'string' ? parseFloat(fieldValue) : fieldValue;
    const conditionValueNum = typeof conditionValue === 'string' ? parseFloat(conditionValue) : conditionValue;

    // NaNチェック
    if (isNaN(fieldValueNum) || isNaN(conditionValueNum)) {
      console.log('数値変換に失敗:', { fieldValue, conditionValue });
      return false;
    }

    let result: boolean;
    switch (condition.operator) {
      case '>':
        result = fieldValueNum > conditionValueNum;
        break;
      case '<':
        result = fieldValueNum < conditionValueNum;
        break;
      case '=':
        result = fieldValueNum === conditionValueNum;
        break;
      case '>=':
        result = fieldValueNum >= conditionValueNum;
        break;
      case '<=':
        result = fieldValueNum <= conditionValueNum;
        break;
      case '!=':
        result = fieldValueNum !== conditionValueNum;
        break;
      default:
        result = false;
    }
    
    console.log('条件評価結果:', {
      expression: `${fieldValueNum} ${condition.operator} ${conditionValueNum}`,
      result
    });
    
    return result;
  };

  const handleTestRule = async () => {
    if (isTestRunning) return;
    
    setIsTestRunning(true);
    setTestResult(null);
    setTestDetails(null);
    
    const startTime = Date.now();
    let executionStatus = 'success';
    let errorMessage = null;
    let conditionsResult: Record<string, any> = {};
    let triggeredAlertId = null;
    
    try {
      console.log('アラートルールテスト開始:', rule);
      console.log('利用可能なMQTTメッセージ:', mqttMessages);
      
      // 最新のMQTTデータを取得
      let latestMQTTData = null;
      if (rule.assetId) {
        latestMQTTData = getLatestMQTTData(rule.assetId);
        console.log('取得した最新MQTTデータ:', latestMQTTData);
      }
      
      // 各条件をテスト
      const conditionResults = [];
      
      for (const condition of rule.conditions) {
        if (condition.type === 'notebook' && condition.notebookConfig) {
          console.log('Notebook条件をテスト中:', condition);
          try {
            const result = await evaluateNotebookCondition(condition, {});
            console.log('Notebook条件テスト結果:', result);
            
            // 条件結果を記録
            conditionsResult[condition.id || condition.parameter] = result;
            
            // 詳細情報を保存（最新のNotebook実行結果から取得）
            const latestResult = (window as any).latestNotebookResult;
            if (latestResult && latestResult.result) {
              setTestDetails({
                resultValue: latestResult.result,
                resultType: typeof latestResult.result,
                parameter: condition.parameter,
                operator: condition.operator,
                threshold: condition.value,
                thresholdType: typeof condition.value,
                evaluationResult: result,
                evaluationExpression: `${latestResult.result} ${condition.operator} ${condition.value} = ${result}`
              });
            }
            
            conditionResults.push({
              condition: condition,
              result: result,
              type: 'notebook',
              error: null
            });
          } catch (error) {
            console.error('Notebook条件テストエラー:', error);
            conditionsResult[condition.id || condition.parameter] = false;
            conditionResults.push({
              condition: condition,
              result: false,
              type: 'notebook',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        } else if (condition.type === 'zscore') {
          // Zスコア条件のテスト（未実装）
          conditionsResult[condition.id || condition.parameter] = false;
          conditionResults.push({
            condition: condition,
            result: false,
            type: 'zscore',
            error: 'Zスコア条件のテストは未実装です'
          });
        } else {
          // シンプル条件のテスト（MQTTデータを使用）
          console.log('シンプル条件をテスト中:', condition);
          
          if (!latestMQTTData) {
            conditionsResult[condition.id || condition.parameter] = false;
            conditionResults.push({
              condition: condition,
              result: false,
              type: 'simple',
              error: '該当するMQTTデータが見つかりませんでした'
            });
            continue;
          }
          
          try {
            const result = evaluateSimpleCondition(condition, latestMQTTData);
            const fieldValue = getNestedValue(latestMQTTData, condition.parameter);
            
            // 条件結果を記録
            conditionsResult[condition.id || condition.parameter] = result;
            
            console.log('シンプル条件テスト結果:', {
              condition,
              fieldValue,
              result
            });
            
            // 詳細情報を保存（シンプル条件用）
            setTestDetails({
              resultValue: fieldValue,
              resultType: typeof fieldValue,
              parameter: condition.parameter,
              operator: condition.operator,
              threshold: condition.value,
              thresholdType: typeof condition.value,
              evaluationResult: result,
              evaluationExpression: `${fieldValue} ${condition.operator} ${condition.value} = ${result}`
            });
            
            conditionResults.push({
              condition: condition,
              result: result,
              type: 'simple',
              error: null
            });
          } catch (error) {
            console.error('シンプル条件テストエラー:', error);
            conditionsResult[condition.id || condition.parameter] = false;
            conditionResults.push({
              condition: condition,
              result: false,
              type: 'simple',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
      
      // 最終実行日時を更新
      setLastExecutionTime(new Date());
      
      // 結果をまとめる
      const allResults = conditionResults;
      const successfulResults = allResults.filter(cr => cr.result);
      const failedResults = allResults.filter(cr => !cr.result);
      const errorResults = allResults.filter(cr => cr.error);
      
      // テスト実行の成功/失敗を判定（エラーがなければ成功）
      const testExecutionSuccess = errorResults.length === 0;
      
      // 条件を満たすかどうかを判定
      const conditionsMet = allResults.length > 0 && allResults.every(cr => cr.result);
      
      // 実行ステータスを設定
      if (!testExecutionSuccess) {
        executionStatus = 'error';
        errorMessage = errorResults.map(cr => cr.error).join(', ');
      } else if (conditionsMet) {
        executionStatus = 'success';
      } else {
        executionStatus = 'success'; // テスト実行は成功、条件は満たさない
      }
      
      let message = '';
      if (allResults.length === 0) {
        message = 'テスト可能な条件がありません';
      } else {
        const successCount = successfulResults.length;
        const totalCount = allResults.length;
        
        // テスト実行が成功した場合
        if (testExecutionSuccess) {
          message = `テスト成功 - 条件評価: ${conditionsMet ? '条件を満たす' : '条件を満たさない'} (${successCount}/${totalCount}個の条件が真)`;
        } else {
          message = `テスト失敗 - 実行エラーが発生しました (${successCount}/${totalCount}個の条件が真)`;
        }
        
        // 各条件タイプの結果を詳細表示
        const notebookResults = allResults.filter(cr => cr.type === 'notebook');
        const simpleResults = allResults.filter(cr => cr.type === 'simple');
        const zscoreResults = allResults.filter(cr => cr.type === 'zscore');
        
        if (notebookResults.length > 0) {
          const notebookSuccess = notebookResults.filter(cr => cr.result).length;
          message += `\nNotebook条件: ${notebookSuccess}/${notebookResults.length}個が真`;
        }
        
        if (simpleResults.length > 0) {
          const simpleSuccess = simpleResults.filter(cr => cr.result).length;
          message += `\nシンプル条件: ${simpleSuccess}/${simpleResults.length}個が真`;
        }
        
        if (zscoreResults.length > 0) {
          message += `\nZスコア条件: 未実装 (${zscoreResults.length}個)`;
        }
        
        // エラー情報を追加（テスト実行に失敗した場合のみ）
        if (!testExecutionSuccess && errorResults.length > 0) {
          const errorMessages = errorResults
            .map(cr => cr.error)
            .join(', ');
          if (errorMessages) {
            message += `\nエラー: ${errorMessages}`;
          }
        }
      }
      
      setTestResult({
        success: testExecutionSuccess,
        message: message
      });
      
      console.log('アラートルールテスト完了:', conditionResults);
      
    } catch (error) {
      console.error('アラートルールテストエラー:', error);
      executionStatus = 'error';
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setTestResult({
        success: false,
        message: `テスト実行エラー: ${errorMessage}`
      });
    } finally {
      // 実行ログを保存
      const executionDuration = Date.now() - startTime;
      try {
        await fetch('/api/alert-rules/execution-logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ruleId: rule.id,
            assetId: rule.assetId,
            executionType: 'test', // テスト実行であることを示す
            executionTime: new Date().toISOString(),
            executionDuration: executionDuration,
            status: executionStatus,
            conditionsEvaluated: rule.conditions || [],
            conditionsResult: conditionsResult,
            triggeredAlertId: triggeredAlertId,
            errorMessage: errorMessage,
            executionContext: {
              ruleName: rule.name,
              testMode: true,
              mqttDataAvailable: !!mqttMessages,
              testTimestamp: new Date().toISOString()
            }
          })
        });
        
        console.log('テスト実行ログを保存しました');
      } catch (logError) {
        console.error('テスト実行ログの保存に失敗しました:', logError);
      }
      
      setIsTestRunning(false);
    }
  };

  const clearTestResult = () => {
    setTestResult(null);
    setTestDetails(null);
  };

  const updateCondition = (conditionId: string, updates: Partial<AlertCondition>) => {
    const updatedConditions = rule.conditions.map(condition =>
      condition.id === conditionId ? { ...condition, ...updates } : condition
    );

    onRuleUpdate({
      ...rule,
      conditions: updatedConditions
    });
    setHasUnsavedChanges(true);
  };

  const removeCondition = (conditionId: string) => {
    const updatedConditions = rule.conditions.filter(c => c.id !== conditionId);
    onRuleUpdate({
      ...rule,
      conditions: updatedConditions
    });
    setHasUnsavedChanges(true);
  };

  const addAction = () => {
    const newAction: AlertAction = {
      id: Date.now().toString(),
      type: 'mqtt',
      config: {
        topic: 'alerts/asset',
        message: 'Alert triggered'
      }
    };

    onRuleUpdate({
      ...rule,
      actions: [...rule.actions, newAction]
    });
    setHasUnsavedChanges(true);
  };

  const updateAction = (actionId: string, updates: Partial<AlertAction>) => {
    const updatedActions = rule.actions.map(action =>
      action.id === actionId ? { ...action, ...updates } : action
    );

    onRuleUpdate({
      ...rule,
      actions: updatedActions
    });
    setHasUnsavedChanges(true);
  };

  const removeAction = (actionId: string) => {
    const updatedActions = rule.actions.filter(a => a.id !== actionId);
    onRuleUpdate({
      ...rule,
      actions: updatedActions
    });
    setHasUnsavedChanges(true);
  };

  const toggleRuleStatus = async () => {
    const updatedRule = {
      ...rule,
      isActive: !rule.isActive
    };
    
    onRuleUpdate(updatedRule);
    setHasUnsavedChanges(true);
    
    // バックエンドにルール状態の変更を通知
    try {
      await fetch('/api/alert-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedRule)
      });
      console.log(`Alert rule ${rule.id} status updated to ${updatedRule.isActive ? 'active' : 'inactive'}`);
    } catch (error) {
      console.error('Error updating alert rule status:', error);
    }
  };

  const handleSave = async () => {
    if (onSave) {
      await onSave(rule.id);
    }
    setHasUnsavedChanges(false);
  };

  const handleRuleNameChange = (name: string) => {
    onRuleUpdate({ ...rule, name });
    setHasUnsavedChanges(true);
  };

  const handleCheckIntervalChange = (interval: number) => {
    onRuleUpdate({ ...rule, checkInterval: interval });
    setHasUnsavedChanges(true);
  };
  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-end">
          <div className="bg-gray-600 text-white px-3 py-1 rounded text-sm font-semibold mr-3">
            Rule {ruleIndex}
          </div>
          {isEditMode ? (
            <div className="mr-4 flex flex-col justify-end">
              <label className="block text-xs text-gray-400 mb-1">アラーム名</label>
              <input
                type="text"
                value={rule.name || ''}
                onChange={(e) => handleRuleNameChange(e.target.value)}
                className="bg-gray-700 text-white px-3 py-2 rounded text-lg font-semibold"
                placeholder="Rule Name"
              />
            </div>
          ) : (
            <div className="bg-gray-700 text-white px-3 py-2 rounded mr-4 text-lg font-semibold">
              {rule.name || 'Unnamed Rule'}
            </div>
          )}
          {isEditMode && (
            <button
              onClick={toggleRuleStatus}
              className={`flex items-center px-4 py-2 rounded ${
                rule.isActive 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-gray-600 hover:bg-gray-700'
              } text-white`}
            >
              {rule.isActive ? <Pause size={16} className="mr-2" /> : <Play size={16} className="mr-2" />}
              {rule.isActive ? 'Active' : 'Inactive'}
            </button>
          )}
        </div>
        
        {isEditMode && (
          <div className="flex items-center space-x-3">
            {hasUnsavedChanges && (
              <span className="text-yellow-400 text-sm">Unsaved changes</span>
            )}
            <button
              onClick={() => {
                setHasUnsavedChanges(false);
                // 親コンポーネントにキャンセルを通知（元の状態へ戻す）
                if (onCancel) {
                  onCancel();
                }
              }}
              className="flex items-center px-4 py-2 rounded text-white bg-gray-600 hover:bg-gray-700"
            >
              キャンセル
            </button>
            <button
              onClick={handleTestRule}
              disabled={isTestRunning}
              className={`flex items-center px-4 py-2 rounded text-white ${
                isTestRunning
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              <TestTube size={16} className="mr-2" />
              {isTestRunning ? 'テスト実行中...' : 'テスト実行'}
            </button>
            <button
              onClick={handleSave}
              className={`flex items-center px-4 py-2 rounded text-white ${
                hasUnsavedChanges
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-600 cursor-not-allowed'
              }`}
              disabled={!hasUnsavedChanges}
            >
              <Save size={16} className="mr-2" />
              保存
            </button>
          </div>
        )}
      </div>

      {/* Check Interval Section */}
      <div className="mb-6">
        <h3 className="text-white font-semibold mb-3">チェック頻度</h3>
        <div className="flex items-center space-x-3">
          {isEditMode ? (
            <div>
              <select
                value={rule.checkInterval || 0}
                onChange={(e) => handleCheckIntervalChange(Number(e.target.value))}
                className="bg-gray-600 text-white px-3 py-2 rounded"
              >
                {checkIntervals.map(interval => (
                  <option key={interval.value} value={interval.value}>
                    {interval.label}
                  </option>
                ))}
              </select>
              <span className="text-gray-400 text-sm">
                ごとにアラート条件をチェック
              </span>
            </div>
          ) : (
            <div>
              <div className="bg-gray-600 text-white px-3 py-2 rounded">
                {checkIntervals.find(i => i.value === (rule.checkInterval || 0))?.label || 'リアルタイム（都度）'}
              </div>
              <span className="text-gray-400 text-sm">
                ごとにアラート条件をチェック
              </span>
            </div>
          )}
        </div>
        
        {/* Last Execution Time */}
        {lastExecutionTime && (
          <div className="mt-2 text-xs text-gray-500">
            最終実行: {lastExecutionTime.toLocaleString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </div>
        )}
      </div>

      {/* Test Result Section */}
      {testResult && (
        <div className="mb-6">
          <div className={`p-4 rounded-lg border ${
            testResult.success 
              ? 'bg-green-900/20 border-green-500/30 text-green-300' 
              : 'bg-red-900/20 border-red-500/30 text-red-300'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-3 ${
                  testResult.success ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <div>
                  <div className="font-medium">
                    {testResult.success ? 'テスト成功' : 'テスト失敗'}
                  </div>
                  <div className="text-sm mt-1">
                    {testResult.message}
                  </div>
                </div>
              </div>
              <button
                onClick={clearTestResult}
                className="text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 p-1 rounded transition-colors"
                title="テスト結果をクリア"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          
          {/* Test Details Section */}
          {testDetails && (
            <div className="mt-3 p-3 bg-gray-800/50 border border-gray-600/30 rounded text-xs text-gray-400">
              <div className="text-gray-300 text-xs font-medium mb-2">判定ロジック詳細</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">取得値:</span>
                  <span className="ml-1 text-gray-300">{String(testDetails.resultValue)}</span>
                </div>
                <div>
                  <span className="text-gray-500">型:</span>
                  <span className="ml-1 text-gray-300">{testDetails.resultType}</span>
                </div>
                <div>
                  <span className="text-gray-500">パラメータ:</span>
                  <span className="ml-1 text-gray-300">{testDetails.parameter}</span>
                </div>
                <div>
                  <span className="text-gray-500">演算子:</span>
                  <span className="ml-1 text-gray-300">{testDetails.operator}</span>
                </div>
                <div>
                  <span className="text-gray-500">閾値:</span>
                  <span className="ml-1 text-gray-300">{String(testDetails.threshold)}</span>
                </div>
                <div>
                  <span className="text-gray-500">閾値型:</span>
                  <span className="ml-1 text-gray-300">{testDetails.thresholdType}</span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-600/30">
                <div className="text-gray-500">判定式:</div>
                <div className="text-gray-300 font-mono text-xs mt-1">
                  {testDetails.evaluationExpression}
                </div>
                <div className="mt-1">
                  <span className="text-gray-500">結果:</span>
                  <span className={`ml-1 font-medium ${
                    testDetails.evaluationResult ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {testDetails.evaluationResult ? '条件を満たす' : '条件を満たさない'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conditions and Actions Layout */}
      <div className="mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Conditions Section - Left Side */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-lg">条件 (Conditions)</h3>
              {isEditMode && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={addCondition}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
                  >
                    <Plus size={14} />
                    <span>シンプル</span>
                  </button>
                  <button
                    onClick={addZScoreCondition}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
                  >
                    <Plus size={14} />
                    <span>Zスコア</span>
                  </button>
                  <button
                    onClick={addNotebookCondition}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm"
                  >
                    <Plus size={14} />
                    <span>Notebook</span>
                  </button>
                </div>
              )}
            </div>
          <div className="space-y-3">
            {rule.conditions.map((condition, index) => (
              <div key={condition.id} className="bg-gray-700 p-4 rounded border-l-4 border-blue-500">
                {index > 0 && (
                  <div className="mb-3">
                    <div className="bg-gray-600 text-white px-3 py-1 rounded text-sm inline-block">
                      {condition.logicalOperator || 'AND'}
                    </div>
                  </div>
                )}
              
                {isEditMode ? (
                  <div>
                    {index > 0 && (
                      <div className="mb-3">
                        <select
                          value={condition.logicalOperator || 'AND'}
                          onChange={(e) => updateCondition(condition.id, { logicalOperator: e.target.value as 'AND' | 'OR' })}
                          className="bg-gray-600 text-white px-3 py-1 rounded text-sm"
                        >
                          {logicalOperators.map(op => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    
                    {/* 条件タイプの表示 */}
                    <div className="mb-3">
                      <div className="bg-gray-600 text-white px-3 py-1 rounded text-xs inline-block">
                        {condition.type === 'zscore' ? 'Zスコア' : condition.type === 'notebook' ? 'Notebook' : 'シンプル'}
                      </div>
                    </div>
                  
                    {condition.type === 'zscore' ? (
                      // Zスコア条件の編集UI（タグ選択＋手入力対応）
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-400">フィールド</span>
                            {assetTags && assetTags.length > 0 && (
                              <span className="text-xs text-gray-500">タグ選択 または 手入力</span>
                            )}
                          </div>
                          {assetTags && assetTags.length > 0 ? (
                            <div className="flex space-x-2">
                              <div className="flex-0">
                                <label className="block text-[10px] text-gray-500 mb-0.5">タグ（ラベル）</label>
                                <select
                                  value={assetTags.find(t => t.key === condition.parameter)?.key || ''}
                                  onChange={(e) => updateCondition(condition.id, { parameter: e.target.value })}
                                  className="bg-gray-600 text-white px-2 py-2 rounded w-44"
                                >
                                  <option value="">手入力（右の欄）</option>
                                  {assetTags.map((t) => (
                                    <option key={t.key} value={t.key}>{t.label}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex-1 min-w-0">
                                <label className="block text-[10px] text-gray-500 mb-0.5">MQTT key（手入力可）</label>
                                <input
                                  type="text"
                                  value={condition.parameter || ''}
                                  onChange={(e) => updateCondition(condition.id, { parameter: e.target.value })}
                                  className="bg-gray-600 text-white px-3 py-2 rounded w-full"
                                  placeholder="例: value.adc_avg"
                                />
                              </div>
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={condition.parameter || ''}
                              onChange={(e) => updateCondition(condition.id, { parameter: e.target.value })}
                              className="bg-gray-600 text-white px-3 py-2 rounded w-full"
                              placeholder="フィールド（例: value.adc_avg)"
                            />
                          )}
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2">
                          <select
                            value={condition.zscoreConfig?.threshold || 2.0}
                            onChange={(e) => updateCondition(condition.id, { 
                              zscoreConfig: { 
                                movingAverageWindow: condition.zscoreConfig?.movingAverageWindow || 15,
                                populationWindow: condition.zscoreConfig?.populationWindow || 28,
                                threshold: Number(e.target.value) 
                              } 
                            })}
                            className="bg-gray-600 text-white px-2 py-2 rounded text-sm"
                          >
                            {zscoreThresholdOptions.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          
                          <select
                            value={condition.zscoreConfig?.movingAverageWindow || 15}
                            onChange={(e) => updateCondition(condition.id, { 
                              zscoreConfig: { 
                                movingAverageWindow: Number(e.target.value),
                                populationWindow: condition.zscoreConfig?.populationWindow || 28,
                                threshold: condition.zscoreConfig?.threshold || 2.0
                              } 
                            })}
                            className="bg-gray-600 text-white px-2 py-2 rounded text-sm"
                          >
                            {movingAverageOptions.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          
                          <select
                            value={condition.zscoreConfig?.populationWindow || 28}
                            onChange={(e) => updateCondition(condition.id, { 
                              zscoreConfig: { 
                                movingAverageWindow: condition.zscoreConfig?.movingAverageWindow || 15,
                                populationWindow: Number(e.target.value),
                                threshold: condition.zscoreConfig?.threshold || 2.0
                              } 
                            })}
                            className="bg-gray-600 text-white px-2 py-2 rounded text-sm"
                          >
                            {populationWindowOptions.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : condition.type === 'notebook' ? (
                      // Notebook条件の編集UI
                      <div className="space-y-3">
                        <div className="bg-blue-900/20 border border-blue-500/30 rounded p-3">
                          <div className="text-blue-300 text-sm font-medium mb-2">📊 Notebook条件の設定</div>
                          <div className="text-xs text-blue-200">
                            1. ノートブックファイル名を指定<br/>
                            2. パラメータを設定<br/>
                            3. APIレスポンスから取得するフィールドを指定<br/>
                            4. 条件判定の演算子と閾値を設定
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          <label className="text-gray-300 text-sm font-medium">APIレスポンスから取得するフィールド:</label>
                          <input
                            type="text"
                            value={condition.parameter || ''}
                            onChange={(e) => updateCondition(condition.id, { parameter: e.target.value })}
                            className="bg-gray-600 text-white px-3 py-2 rounded"
                            placeholder="例: result, data.score, analysis.is_anomaly"
                          />
                          <div className="text-xs text-gray-400">
                            • 単純な値: <code className="bg-gray-700 px-1 rounded">result</code><br/>
                            • ネストした値: <code className="bg-gray-700 px-1 rounded">data.score</code><br/>
                            • Boolean値: <code className="bg-gray-700 px-1 rounded">success</code>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 gap-2">
                          <label className="text-gray-300 text-sm font-medium">ノートブックファイル名:</label>
                          <input
                            type="text"
                            value={condition.notebookConfig?.notebook || ''}
                            onChange={(e) => updateCondition(condition.id, { 
                              notebookConfig: { 
                                notebook: e.target.value,
                                parameters: condition.notebookConfig?.parameters || {},
                                executionTime: condition.notebookConfig?.executionTime || 30000,
                                maxRetries: condition.notebookConfig?.maxRetries || 3
                              } 
                            })}
                            className="bg-gray-600 text-white px-3 py-2 rounded"
                            placeholder="例: kpi_monthly.ipynb"
                          />
                          {/* Notebookリンク表示 */}
                          {condition.notebookConfig?.notebook && (
                            <div className="mt-2">
                              <a 
                                href={`https://glicocmms-cbm-notebooks.org/lab/lab/workspaces/auto-o/tree/${condition.notebookConfig.notebook}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-sm underline flex items-center"
                              >
                                <ExternalLink size={14} className="mr-1" />
                                {condition.notebookConfig.notebook} を開く
                              </a>
                            </div>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-gray-300 text-sm font-medium">標準実行時間 (秒):</label>
                            <input
                              type="number"
                              value={condition.notebookConfig?.executionTime ? condition.notebookConfig.executionTime / 1000 : 30}
                              onChange={(e) => updateCondition(condition.id, { 
                                notebookConfig: { 
                                  notebook: condition.notebookConfig?.notebook || '',
                                  parameters: condition.notebookConfig?.parameters || {},
                                  executionTime: Number(e.target.value) * 1000,
                                  maxRetries: condition.notebookConfig?.maxRetries || 3
                                } 
                              })}
                              className="bg-gray-600 text-white px-3 py-2 rounded text-sm"
                              placeholder="30"
                              min="1"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-gray-300 text-sm font-medium">最大リトライ回数:</label>
                            <input
                              type="number"
                              value={condition.notebookConfig?.maxRetries || 3}
                              onChange={(e) => updateCondition(condition.id, { 
                                notebookConfig: { 
                                  notebook: condition.notebookConfig?.notebook || '',
                                  parameters: condition.notebookConfig?.parameters || {},
                                  executionTime: condition.notebookConfig?.executionTime || 30000,
                                  maxRetries: Number(e.target.value)
                                } 
                              })}
                              className="bg-gray-600 text-white px-3 py-2 rounded text-sm"
                              placeholder="3"
                              min="0"
                              max="10"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-gray-300 text-sm">パラメータ:</label>
                          <div className="space-y-2">
                            {Object.entries(condition.notebookConfig?.parameters || {}).map(([key, value], index) => (
                              <div key={index} className="grid grid-cols-3 gap-2">
                                <input
                                  type="text"
                                  value={key}
                                  onChange={(e) => {
                                    const newParams = { ...condition.notebookConfig?.parameters };
                                    delete newParams[key];
                                    newParams[e.target.value] = value;
                                    updateCondition(condition.id, { 
                                      notebookConfig: { 
                                        notebook: condition.notebookConfig?.notebook || '',
                                        parameters: newParams,
                                        executionTime: condition.notebookConfig?.executionTime || 30000,
                                        maxRetries: condition.notebookConfig?.maxRetries || 3
                                      } 
                                    });
                                  }}
                                  className="bg-gray-600 text-white px-3 py-2 rounded text-sm"
                                  placeholder="パラメータ名"
                                />
                                <input
                                  type="text"
                                  value={String(value)}
                                  onChange={(e) => updateCondition(condition.id, { 
                                    notebookConfig: { 
                                      notebook: condition.notebookConfig?.notebook || '',
                                      parameters: { 
                                        ...condition.notebookConfig?.parameters, 
                                        [key]: e.target.value 
                                      },
                                      executionTime: condition.notebookConfig?.executionTime || 30000,
                                      maxRetries: condition.notebookConfig?.maxRetries || 3
                                    } 
                                  })}
                                  className="bg-gray-600 text-white px-3 py-2 rounded text-sm"
                                  placeholder="値"
                                />
                                <button
                                  onClick={() => {
                                    const newParams = { ...condition.notebookConfig?.parameters };
                                    delete newParams[key];
                                    updateCondition(condition.id, { 
                                      notebookConfig: { 
                                        notebook: condition.notebookConfig?.notebook || '',
                                        parameters: newParams,
                                        executionTime: condition.notebookConfig?.executionTime || 30000,
                                        maxRetries: condition.notebookConfig?.maxRetries || 3
                                      } 
                                    });
                                  }}
                                  className="text-gray-400 hover:text-red-400 hover:bg-gray-700 p-1 rounded transition-colors"
                                  title="パラメータを削除"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => {
                                const newParams = { ...condition.notebookConfig?.parameters };
                                newParams['new_param'] = '';
                                updateCondition(condition.id, { 
                                  notebookConfig: { 
                                    notebook: condition.notebookConfig?.notebook || '',
                                    parameters: newParams,
                                    executionTime: condition.notebookConfig?.executionTime || 30000,
                                    maxRetries: condition.notebookConfig?.maxRetries || 3
                                  } 
                                });
                              }}
                              className="text-blue-400 hover:text-blue-300 text-sm"
                            >
                              + パラメータ追加
                            </button>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-gray-300 text-sm font-medium">条件判定:</label>
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={condition.operator}
                              onChange={(e) => updateCondition(condition.id, { operator: e.target.value as any })}
                              className="bg-gray-600 text-white px-2 py-2 rounded text-sm"
                            >
                              {operators.map(op => (
                                <option key={op} value={op}>{op}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={condition.value}
                              onChange={(e) => updateCondition(condition.id, { value: Number(e.target.value) })}
                              className="bg-gray-600 text-white px-3 py-2 rounded text-sm"
                              placeholder="閾値"
                            />
                          </div>
                          <div className="text-xs text-gray-400">
                            上記で指定したフィールドの値が、選択した演算子と閾値で条件を満たすかチェックします
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="grid grid-cols-12 gap-2 mb-1">
                          <div className="col-span-4 text-xs text-gray-300">タグ（ラベル）</div>
                          <div className="col-span-4 text-xs text-gray-300">MQTT key（手入力可）</div>
                          <div className="col-span-2 text-xs text-gray-300">演算子</div>
                          <div className="col-span-2 text-xs text-gray-300">閾値</div>
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-4">
                            {assetTags && assetTags.length > 0 ? (
                              <select
                                value={assetTags.find(t => t.key === condition.parameter)?.key || ''}
                                onChange={(e) => updateCondition(condition.id, { parameter: e.target.value })}
                                className="bg-gray-600 text-white px-2 py-2 rounded w-full"
                              >
                                <option value="">（未選択）</option>
                                {assetTags.map((t) => (
                                  <option key={t.key} value={t.key}>{t.label}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="text-xs text-gray-500 py-2">タグ未登録</div>
                            )}
                          </div>
                          <div className="col-span-4">
                            <input
                              type="text"
                              value={condition.parameter || ''}
                              onChange={(e) => updateCondition(condition.id, { parameter: e.target.value })}
                              className="bg-gray-600 text-white px-3 py-2 rounded w-full"
                              placeholder="例: value.temperature"
                            />
                          </div>
                          <div className="col-span-2">
                            <select
                              value={condition.operator}
                              onChange={(e) => updateCondition(condition.id, { operator: e.target.value as any })}
                              className="bg-gray-600 text-white py-2 rounded w-full text-center"
                            >
                              {operators.map(op => (
                                <option key={op} value={op}>{op}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              value={condition.value || ''}
                              onChange={(e) => {
                                const value = e.target.value === '' ? 0 : Number(e.target.value);
                                updateCondition(condition.id, { value });
                              }}
                              className="bg-gray-600 text-white px-3 py-2 rounded w-full"
                              placeholder="閾値"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 条件タイプの表示（閲覧モード） */}
                    <div className="mb-1">
                      <div className="bg-gray-600 text-white px-2 py-0.5 rounded text-xs inline-block">
                        {condition.type === 'zscore' ? 'Zスコア' : condition.type === 'notebook' ? 'Notebook' : 'シンプル'}
                      </div>
                    </div>

                    {condition.type === 'zscore' ? (
                      <div className="text-sm text-gray-300 space-y-1">
                        <div>フィールド: <code className="bg-gray-700 px-1 rounded">{condition.parameter}</code></div>
                        <div>Z閾値: {condition.zscoreConfig?.threshold ?? 2.0}</div>
                        <div>移動平均: {condition.zscoreConfig?.movingAverageWindow ?? 15} 分</div>
                        <div>母集団期間: {condition.zscoreConfig?.populationWindow ?? 28} 日</div>
                      </div>
                    ) : condition.type === 'notebook' ? (
                      <div className="text-sm text-gray-300 space-y-1">
                        <div>Notebook: <code className="bg-gray-700 px-1 rounded">{condition.notebookConfig?.notebook || '-'}</code></div>
                        <div>フィールド: <code className="bg-gray-700 px-1 rounded">{condition.parameter}</code></div>
                        <div>条件: <code className="bg-gray-700 px-1 rounded">{condition.operator} {String(condition.value)}</code></div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-300 space-y-1">
                        <div>フィールド: <code className="bg-gray-700 px-1 rounded">{condition.parameter}</code></div>
                        <div>条件: <code className="bg-gray-700 px-1 rounded">{condition.operator} {String(condition.value)}</code></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};