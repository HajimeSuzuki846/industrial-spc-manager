import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Cpu, Wifi, WifiOff, AlertTriangle, Settings, Activity, Hash, Copy, ExternalLink, FileText, HelpCircle } from 'lucide-react';
import { Asset, AlertRule, AssetType } from '../types';
import { AlertRuleBuilder } from './AlertRuleBuilder';
import { AlertRuleExecutionLogs } from './AlertRuleExecutionLogs';
import { ASSET_TYPES, getAssetTypeLabel } from '../constants/assetTypes';
import { useDataSync } from '../hooks/useDataSync';

interface AssetDetailProps {
  asset: Asset;
  onAssetUpdate: (asset: Asset) => void;
  mqttMessages: Record<string, any>;
  isEditMode?: boolean;
  publish?: (topic: string, message: string) => void; // MQTT publish関数を追加
}

export const AssetDetail: React.FC<AssetDetailProps> = React.memo(({ 
  asset,
  onAssetUpdate,
  mqttMessages,
  isEditMode = false,
  publish
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'rules' | 'logs' | 'tags' | 'settings'>('overview');
  const [isRawDataExpanded, setIsRawDataExpanded] = useState(false);
  const [localAsset, setLocalAsset] = useState<Asset>(asset);
  const [grafanaTimeSpan, setGrafanaTimeSpan] = useState<'5m' | '1h' | '24h' | '2d' | '7d' | '30d'>('1h');
  const [grafanaRangeMode, setGrafanaRangeMode] = useState<'relative' | 'absolute'>('relative');
  const [absoluteFrom, setAbsoluteFrom] = useState<string>(() => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return iso;
  });
  const [absoluteTo, setAbsoluteTo] = useState<string>(() => {
    const d = new Date();
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return iso;
  });
  const [showCopyPopup, setShowCopyPopup] = useState(false);
  const { saveAlertRule, loadAlertRules, saveAssetToDB } = useDataSync();
  const hasLoadedRules = useRef(false);
  const lastSavedRulesRef = useRef<AlertRule[]>(asset.alertRules);
  const isTagCapturePendingRef = useRef(false);
  // UUID 生成
  const generateUUID = useCallback(() => {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }, []);

  // リセット履歴 モーダル状態
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTag, setHistoryTag] = useState<{ tagId: string; label: string } | null>(null);
  const [historyRows, setHistoryRows] = useState<Array<{ resetAt: string; value: any }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const openHistory = useCallback(async (tagId: string, label: string) => {
    setHistoryTag({ tagId, label });
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      // まずプロキシ経由
      let resp = await fetch(`/api/tags/${tagId}/reset-events?pageSize=50`);
      if (resp.status === 404) {
        // backend直叩き
        resp = await fetch(`http://localhost:3001/api/tags/${tagId}/reset-events?pageSize=50`);
      }
      if (!resp.ok) throw new Error('failed');
      const data = await resp.json();
      const events = data.events || data || [];
      setHistoryRows(events.map((e: any) => ({ resetAt: e.resetAt || e.reset_at, value: e.value })));
    } catch (e) {
      setHistoryError('履歴の取得に失敗しました');
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  // JSON貼り付け用状態
  const jsonInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [parsedJson, setParsedJson] = useState<any>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [selectedJsonPaths, setSelectedJsonPaths] = useState<Set<string>>(new Set());
  
  // 入力中はパースしない。ユーザー操作で解析。
  const parseJsonNow = useCallback(() => {
    const text = jsonInputRef.current?.value || '';
    if (!text || text.trim() === '') {
      setParsedJson(null);
      setJsonError(null);
      return;
    }
    try {
      const obj = JSON.parse(text);
      setParsedJson(obj);
      setJsonError(null);
    } catch (e) {
      setParsedJson(null);
      setJsonError('JSONの構文エラーです');
    }
  }, []);

  // ツリー描画（チェックボックス付）: 選択状態を依存に持つためuseCallback
  const renderJsonTree = useCallback((node: any, basePath: string = ''): JSX.Element | null => {
    if (node === null || node === undefined) return null;

    // プリミティブ値
    if (typeof node !== 'object') {
      const path = basePath;
      const checked = selectedJsonPaths.has(path);
      return (
        <div className="flex items-center space-x-2 py-1" key={path}>
          <input
            type="checkbox"
            className="form-checkbox h-4 w-4 text-blue-600"
            checked={checked}
            onChange={() => {
              const next = new Set(selectedJsonPaths);
              if (checked) next.delete(path); else next.add(path);
              setSelectedJsonPaths(next);
            }}
          />
          <code className="text-gray-300 text-xs">{path}</code>
        </div>
      );
    }

    // 配列
    if (Array.isArray(node)) {
      const path = basePath;
      const checked = selectedJsonPaths.has(path);
      return (
        <div className="ml-3" key={path}>
          <div className="flex items-center space-x-2 py-1">
            <input
              type="checkbox"
              className="form-checkbox h-4 w-4 text-blue-600"
              checked={checked}
              onChange={() => {
                const next = new Set(selectedJsonPaths);
                if (checked) next.delete(path); else next.add(path);
                setSelectedJsonPaths(next);
              }}
            />
            <code className="text-gray-300 text-xs">{path}[]</code>
          </div>
        </div>
      );
    }

    // オブジェクト
    const entries = Object.entries(node as Record<string, any>);
    return (
      <div className="ml-3" key={basePath || 'root'}>
        {basePath && (
          <div className="flex items-center space-x-2 py-1">
            <input
              type="checkbox"
              className="form-checkbox h-4 w-4 text-blue-600"
              checked={selectedJsonPaths.has(basePath)}
              onChange={() => {
                const next = new Set(selectedJsonPaths);
                if (next.has(basePath)) next.delete(basePath); else next.add(basePath);
                setSelectedJsonPaths(next);
              }}
            />
            <code className="text-gray-300 text-xs">{basePath}</code>
          </div>
        )}
        <div>
          {entries.map(([k, v]) => {
            const nextPath = basePath ? `${basePath}.${k}` : k;
            return (
              <div key={nextPath}>
                {renderJsonTree(v, nextPath)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }, [selectedJsonPaths]);

  // 入力中の再レンダリング負荷を下げるため、ツリーはparsedJson/選択状態が変わる時だけ再構築
  const treeView = useMemo(() => {
    if (!parsedJson) return null;
    return renderJsonTree(parsedJson);
  }, [parsedJson, renderJsonTree]);

  // 安定したonAssetUpdate関数を作成
  const stableOnAssetUpdate = useCallback((updatedAsset: Asset) => {
    onAssetUpdate(updatedAsset);
  }, [onAssetUpdate]);

  // アセットIDをコピーしてポップアップを表示
  const handleCopyAssetId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(asset.id);
      setShowCopyPopup(true);
      // 2秒後にポップアップを非表示にする
      setTimeout(() => {
        setShowCopyPopup(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy asset ID:', err);
    }
  }, [asset.id]);

  // MQTTメッセージから解析されたセンサーデータを取得（メモ化）
  const getSensorData = useCallback(() => {
    const message = asset.mqttTopic ? mqttMessages[asset.mqttTopic] : null;
    if (!message) return null;

    // メッセージが文字列の場合、JSONとしてパースを試行
    let parsedMessage;
    if (typeof message.value === 'string') {
      try {
        parsedMessage = JSON.parse(message.value);
      } catch {
        return { value: message.value };
      }
    } else {
      parsedMessage = message.value;
    }

    // 単純な値の場合（例: {"value": 111}）は特別に処理
    if (parsedMessage && typeof parsedMessage === 'object' && 
        Object.keys(parsedMessage).length === 1 && 
        'value' in parsedMessage && 
        typeof parsedMessage.value !== 'object') {
      return { value: parsedMessage.value };
    }

    return parsedMessage;
  }, [asset.mqttTopic, mqttMessages]);

  // センサーデータをフォーマットして表示用に変換
  const formatSensorValue = useCallback((value: any) => {
    if (value === null || value === undefined) return 'N/A';
    
    // 数値の場合は小数点2桁でフォーマット
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    
    // 文字列の場合はそのまま返す
    if (typeof value === 'string') {
      return value;
    }
    
    // その他の場合は文字列に変換
    return String(value);
  }, []);

  // センサーフィールドのラベルを取得
  const getSensorLabel = useCallback((key: string) => {
    const labelMap: Record<string, string> = {
      'adc_avg': 'ADC Average',
      'adc_min': 'ADC Minimum',
      'adc_max': 'ADC Maximum',
      'adc_series': 'ADC Series',
      'gpio3': 'GPIO 3',
      'gpio4': 'GPIO 4',
      'temperature': 'Temperature',
      'humidity': 'Humidity',
      'pressure': 'Pressure',
      'voltage': 'Voltage',
      'current': 'Current',
      'value': 'Value'
    };
    return labelMap[key] || key.charAt(0).toUpperCase() + key.slice(1);
  }, []);

  // 現在のセンサーデータと最終更新時刻をメモ化
  const sensorData = useMemo(() => getSensorData(), [getSensorData]);
  const lastUpdate = useMemo(() => 
    asset.mqttTopic ? mqttMessages[asset.mqttTopic]?.timestamp : null, 
    [asset.mqttTopic, mqttMessages]
  );

  // 後方互換性のための formattedValue
  const formattedValue = useMemo(() => {
    if (!sensorData) return 'N/A';
    if (typeof sensorData === 'object' && sensorData !== null) {
      // オブジェクトの場合は最初の数値フィールドを使用
      const numericFields = Object.entries(sensorData).find(([key, value]) => 
        typeof value === 'number' && key !== 'timestamp'
      );
      if (numericFields) {
        return formatSensorValue(numericFields[1]);
      }
      return 'Multiple values';
    }
    return formatSensorValue(sensorData);
  }, [sensorData, formatSensorValue]);

  // タグ自動検出: 次のMQTT受信でキーを取り出してタグ作成
  useEffect(() => {
    if (!isTagCapturePendingRef.current) return;
    if (!asset.mqttTopic) return;
    const msg = mqttMessages[asset.mqttTopic];
    if (!msg || !msg.value || typeof msg.value !== 'object') return;

    const keys = Object.keys(msg.value);
    if (keys.length === 0) return;

    const newTags = keys.map(k => ({ label: `value.${k}`, key: `value.${k}` }));
    const dedup = new Map<string, { label: string; key: string }>();
    [...(asset.tags || []), ...newTags].forEach(t => { if (!dedup.has(t.key)) dedup.set(t.key, t); });

    const updatedAsset = { ...asset, tags: Array.from(dedup.values()) };
    onAssetUpdate(updatedAsset);
    // DBへ即時保存（Asset idに紐付け）
    saveAssetToDB(updatedAsset).catch(err => console.error('Failed to persist captured tags:', err));
    isTagCapturePendingRef.current = false;
  }, [asset, mqttMessages, onAssetUpdate, saveAssetToDB]);

  // GrafanaのURLを生成する関数（メモ化）
  const getGrafanaUrl = useCallback(() => {
    const base = 'https://glicocmmsbeta.org/d-solo/deewnp24piz668d/influxdb?orgId=1';
    let fromParam: string | number;
    let toParam: string | number;
    let interval = '5 minutes';

    if (grafanaRangeMode === 'relative') {
      const fromToMap: Record<'5m' | '1h' | '24h' | '2d' | '7d' | '30d', string> = {
        '5m': 'now-5m',
        '1h': 'now-1h',
        '24h': 'now-24h',
        '2d': 'now-2d',
        '7d': 'now-7d',
        '30d': 'now-30d'
      };
      const intervalMap: Record<'5m' | '1h' | '24h' | '2d' | '7d' | '30d', string> = {
        '5m': '5 minutes',
        '1h': '1 hour',
        '24h': '1 day',
        '2d': '2 days',
        '7d': '7 days',
        '30d': '30 days'
      };
      fromParam = fromToMap[grafanaTimeSpan];
      toParam = 'now';
      interval = intervalMap[grafanaTimeSpan];
    } else {
      // Absolute range: use UNIX epoch ms for Grafana
      const parseLocal = (s: string) => {
        // s is in 'YYYY-MM-DDTHH:mm' as local time; convert to ms
        const [datePart, timePart] = s.split('T');
        const [y, m, d] = datePart.split('-').map(Number);
        const [hh, mm] = timePart.split(':').map(Number);
        const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
        return dt.getTime();
      };
      const fromMs = parseLocal(absoluteFrom);
      const toMs = parseLocal(absoluteTo);
      fromParam = fromMs;
      toParam = toMs;
      const rangeMs = Math.max(0, toMs - fromMs);
      if (rangeMs <= 60 * 60 * 1000) interval = '1 minute';
      else if (rangeMs <= 6 * 60 * 60 * 1000) interval = '5 minutes';
      else if (rangeMs <= 24 * 60 * 60 * 1000) interval = '15 minutes';
      else if (rangeMs <= 7 * 24 * 60 * 60 * 1000) interval = '1 hour';
      else if (rangeMs <= 30 * 24 * 60 * 60 * 1000) interval = '6 hours';
      else interval = '1 day';
    }

    return `${base}&from=${fromParam}&to=${toParam}&timezone=browser&var-AssetId=${encodeURIComponent(asset.id)}&var-Interval=${encodeURIComponent(interval)}&refresh=5m&panelId=1&__feature.dashboardSceneSolo=true`;
  }, [asset.id, grafanaRangeMode, grafanaTimeSpan, absoluteFrom, absoluteTo]);


  // ステータスアイコンをメモ化
  const statusIcon = useMemo(() => {
    switch (asset.status) {
      case 'online':
        return <Wifi className="text-green-500" size={20} />;
      case 'offline':
        return <WifiOff className="text-gray-500" size={20} />;
      case 'warning':
        return <AlertTriangle className="text-yellow-500" size={20} />;
      case 'error':
        return <AlertTriangle className="text-red-500" size={20} />;
      default:
        return <WifiOff className="text-gray-500" size={20} />;
    }
  }, [asset.status]);

  // アラートルール関連の関数をメモ化
  const addNewRule = useCallback(() => {
    // 編集モードでない場合は追加を無効にする
    if (!isEditMode) {
      console.log('Edit mode is disabled, rule addition ignored');
      return;
    }

    const newRule: AlertRule = {
      id: Date.now().toString(),
      name: 'New Alert Rule',
      assetId: asset.id,
      conditions: [],
      actions: [],
      isActive: false,
      checkInterval: 0 // デフォルトリアルタイム（都度）
    };

    stableOnAssetUpdate({
      ...asset,
      alertRules: [...asset.alertRules, newRule]
    });
  }, [isEditMode, asset, stableOnAssetUpdate]);

  const updateRule = useCallback((updatedRule: AlertRule) => {
    // 編集モードでない場合は更新を無効にする
    if (!isEditMode) {
      console.log('Edit mode is disabled, rule update ignored');
      return;
    }

    const updatedRules = asset.alertRules.map(rule =>
      rule.id === updatedRule.id ? updatedRule : rule
    );

    const updatedAsset = {
      ...asset,
      alertRules: updatedRules
    };
    
    stableOnAssetUpdate(updatedAsset);
  }, [isEditMode, asset, stableOnAssetUpdate]);

  const handleRuleSave = useCallback(async (ruleId: string) => {
    try {
      // まずアセットを保存（存在しない場合のため）
      const assetSuccess = await saveAssetToDB(asset);
      if (!assetSuccess) {
        console.error('Failed to save asset');
        return;
      }

      // 保存対象のルールを取得
      const ruleToSave = asset.alertRules.find(rule => rule.id === ruleId);
      if (!ruleToSave) {
        console.error('Rule not found for saving');
        return;
      }

      // データベースに保存
      const success = await saveAlertRule(ruleToSave);
      
      if (success) {
        console.log('Alert rule saved successfully');
        
        // 保存後にアラートルールを再読み込み
        try {
          const updatedRules = await loadAlertRules(asset.id);
          console.log('Reloaded rules after save:', updatedRules);
          
          const updatedAsset = {
            ...asset,
            alertRules: updatedRules,
            hasUnsavedChanges: false
          };
          
          stableOnAssetUpdate(updatedAsset);
          // 最終保存状態を更新
          lastSavedRulesRef.current = updatedRules;
        } catch (reloadError) {
          console.error('Error reloading rules after save:', reloadError);
        }
      } else {
        console.error('Failed to save alert rule');
      }
    } catch (error) {
      console.error('Error saving alert rule:', error);
    }
  }, [asset, saveAssetToDB, saveAlertRule, loadAlertRules, stableOnAssetUpdate]);

  const handleSaveSettings = useCallback(async () => {
    try {
      // データベースに保存
      const success = await saveAssetToDB(localAsset);
      if (success) {
        console.log('Asset settings saved successfully');
        // 親コンポーネントに変更を反映
        stableOnAssetUpdate(localAsset);
        // 成功メッセージを表示
        alert('設定が保存されました');
        // ローカル状態をリセット（親から更新された値を使用）
        setLocalAsset(localAsset);
      } else {
        console.error('Failed to save asset settings');
        alert('設定の保存に失敗しました');
      }
    } catch (error) {
      console.error('Error saving asset settings:', error);
      alert('設定の保存中にエラーが発生しました');
    }
  }, [localAsset, stableOnAssetUpdate, saveAssetToDB]);



  // アラートルールを初期化時に読み込み
  useEffect(() => {
    // 既に読み込み済みの場合はスキップ
    if (hasLoadedRules.current) {
      return;
    }

    const loadRules = async () => {
      try {
        const rules = await loadAlertRules(asset.id);
        console.log('Loaded alert rules:', rules);
        console.log('Current asset alert rules:', asset.alertRules);
        
        // データベースから読み込んだルールがある場合は、それを使用
        if (rules.length > 0) {
          const updatedAsset = {
            ...asset,
            alertRules: rules
          };
          console.log('Updating asset with loaded rules:', updatedAsset);
          stableOnAssetUpdate(updatedAsset);
          // DBから読み込んだ状態を保存
          lastSavedRulesRef.current = rules;
        } else {
          console.log('No rules found in database for asset:', asset.id);
          // DBに無ければ現在のアセットの状態を保存
          lastSavedRulesRef.current = asset.alertRules;
        }
        
        // 読み込み完了をマーク
        hasLoadedRules.current = true;
      } catch (error) {
        console.error('Error loading alert rules:', error);
        // エラーが発生しても読み込み完了をマーク
        hasLoadedRules.current = true;
        // フォールバックとして現在の状態を保存
        lastSavedRulesRef.current = asset.alertRules;
      }
    };

    // コンポーネントマウント時またはアセットID変更時に実行
    loadRules();
  }, [asset.id, loadAlertRules, stableOnAssetUpdate]);

  // アセットIDが変更された場合にリセット
  useEffect(() => {
    hasLoadedRules.current = false;
  }, [asset.id]);

  // アセットが変更されたときにローカル状態を更新
  useEffect(() => {
    setLocalAsset(asset);
  }, [asset]);

  // 編集モードをOFFにしたら未保存の編集は破棄して保存済みルールを表示
  useEffect(() => {
    if (!isEditMode) {
      try {
        stableOnAssetUpdate({
          ...asset,
          alertRules: lastSavedRulesRef.current
        });
      } catch (e) {
        console.error('Failed to revert rules on leaving edit mode:', e);
      }
    }
  }, [isEditMode, asset, stableOnAssetUpdate]);

  // タグにUUIDが無ければ付与
  useEffect(() => {
    if (!asset.tags || asset.tags.length === 0) return;
    const needsUpdate = asset.tags.some(t => !t.tagId);
    if (!needsUpdate) return;
    const updated = asset.tags.map(t => ({ ...t, tagId: t.tagId || generateUUID() }));
    onAssetUpdate({ ...asset, tags: updated });
    // DBにも保存
    saveAssetToDB({ ...asset, tags: updated }).catch(() => {});
  }, [asset, onAssetUpdate, saveAssetToDB, generateUUID]);

  // タブコンテンツをメモ化
  const tabContent = useMemo(() => {
    if (activeTab === 'overview') {
      return (
        <div className="space-y-6 min-w-0">
          {/* Sensor Data - Consolidated Section */}
          <div className="bg-gray-900 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <h3 className="text-white font-semibold">現在値</h3>
                <div className="text-gray-400 text-sm">
                  <span className="text-gray-500">Topic:</span>
                  <code className="text-green-400 bg-gray-800 px-2 py-1 rounded text-xs ml-1">
                    {asset.mqttTopic || 'Not configured'}
                  </code>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setIsRawDataExpanded(!isRawDataExpanded)}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Show raw data"
                >
                  <HelpCircle size={16} />
                </button>
                <span className="text-gray-400 text-sm">
                  {lastUpdate ? new Date(lastUpdate).toLocaleString() : 'No data'}
                </span>
              </div>
            </div>

            {sensorData && typeof sensorData === 'object' && sensorData !== null && Object.keys(sensorData).length > 0 ? (
              <div className="space-y-4">
                {/* Sensor Values Table - Fixed height with scroll */}
                <div className="h-32 overflow-y-auto">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {Object.entries(sensorData)
                      .filter(([key, value]) => key !== 'timestamp' && value !== null && value !== undefined)
                      .map(([key, value]) => (
                        <div key={key} className="bg-gray-800 p-2 rounded min-w-0">
                          <div className="text-gray-400 text-xs mb-1 truncate">
                            {getSensorLabel(key)}
                          </div>
                          <div className="text-white font-mono text-xs truncate">
                            {formatSensorValue(value)}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Raw Data - Collapsible */}
                {isRawDataExpanded && (
                  <div className="border-t border-gray-700 pt-4">
                    <div className="text-gray-400 text-sm mb-2">Raw Data:</div>
                    <pre className="text-green-400 bg-gray-800 p-3 rounded text-xs overflow-x-auto max-w-full">
                      {asset.mqttTopic && mqttMessages[asset.mqttTopic] 
                        ? JSON.stringify(mqttMessages[asset.mqttTopic], null, 2)
                        : 'No message received'
                      }
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-3xl font-bold text-blue-400 mb-2">
                  {formattedValue}
                </div>
                <div className="text-gray-400 text-sm">
                  No sensor data
                </div>
                
                {/* Raw Data for simple values */}
                {isRawDataExpanded && (
                  <div className="border-t border-gray-700 pt-4 mt-4">
                    <div className="text-gray-400 text-sm mb-2">Raw Data:</div>
                    <pre className="text-green-400 bg-gray-800 p-3 rounded text-xs overflow-x-auto max-w-full">
                      {asset.mqttTopic && mqttMessages[asset.mqttTopic] 
                        ? JSON.stringify(mqttMessages[asset.mqttTopic], null, 2)
                        : 'No message received'
                      }
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Last Executed Notebook */}
          {(asset.lastNotebookPath || asset.activeAlertNotebookPath) && (
            <div className="bg-gray-900 p-4 rounded-lg">
              <h3 className="text-white font-semibold mb-2">Last Executed Notebook</h3>
              <div className="text-sm text-gray-300 flex items-center space-x-2">
                <ExternalLink size={14} className="text-blue-400" />
                <a
                  href={(asset.lastNotebookUrl || asset.activeAlertNotebookUrl) || `https://glicocmms-cbm-notebooks.org/notebooks/${asset.lastNotebookPath || asset.activeAlertNotebookPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline break-all"
                >
                  {asset.lastNotebookPath || asset.activeAlertNotebookPath}
                </a>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {asset.lastNotebookExecutedAt ? `Executed at: ${new Date(asset.lastNotebookExecutedAt).toLocaleString()}` : 'Executed time unknown'}
              </div>
            </div>
          )}

          {/* Grafana Dashboard */}
          <div className="bg-gray-900 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">Grafana Dashboard</h3>
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400 text-sm">範囲:</span>
                  <button
                    className={`px-2 py-1 rounded text-xs ${grafanaRangeMode === 'relative' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                    onClick={() => setGrafanaRangeMode('relative')}
                  >相対</button>
                  <button
                    className={`px-2 py-1 rounded text-xs ${grafanaRangeMode === 'absolute' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                    onClick={() => setGrafanaRangeMode('absolute')}
                  >絶対</button>
                </div>
                {grafanaRangeMode === 'relative' ? (
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-400 text-sm">タイムスパン:</span>
                    <select
                      value={grafanaTimeSpan}
                      onChange={(e) => setGrafanaTimeSpan(e.target.value as '5m' | '1h' | '24h' | '2d' | '7d' | '30d')}
                      className="bg-gray-700 text-white px-3 py-1 rounded text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="5m">直近5分</option>
                      <option value="1h">直近1時間</option>
                      <option value="24h">直近24時間</option>
                      <option value="2d">直近2日</option>
                      <option value="7d">直近7日</option>
                      <option value="30d">直近日か月(1か月)</option>
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="text-gray-400">期間:</span>
                    <input
                      type="datetime-local"
                      value={absoluteFrom}
                      onChange={(e) => setAbsoluteFrom(e.target.value)}
                      className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-gray-400">〜</span>
                    <input
                      type="datetime-local"
                      value={absoluteTo}
                      onChange={(e) => setAbsoluteTo(e.target.value)}
                      className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="w-full h-96 bg-gray-800 rounded-lg overflow-hidden relative">
              {/* ローディング表示 */}
              <div className="grafana-loading absolute inset-0 flex items-center justify-center bg-gray-800">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                  <p className="text-gray-400">Grafanaダッシュボードを読み込み中...</p>
                </div>
              </div>
              
                             {/* iframe - より制限的な設定で試行 */}
               <iframe
                 key={`grafana-${grafanaRangeMode}-${grafanaTimeSpan}-${absoluteFrom}-${absoluteTo}`}
                 src={getGrafanaUrl()}
                 className="w-full h-full border-0 relative z-10"
                 title="Grafana Dashboard"
                 sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation allow-presentation"
                 allow="fullscreen; clipboard-read; clipboard-write"
                 loading="lazy"
                 referrerPolicy="no-referrer"
                onLoad={() => {
                  // iframeが読み込まれたらローディングを非表示
                  const loadingElement = document.querySelector('.grafana-loading');
                  if (loadingElement) {
                    loadingElement.classList.add('hidden');
                  }
                }}
                onError={() => {
                  console.log('Grafana iframe failed to load');
                  // エラー時はローディングを非表示にしてエラーメッセージを表示
                  const loadingElement = document.querySelector('.grafana-loading');
                  if (loadingElement) {
                    loadingElement.innerHTML = `
                      <div class="text-center">
                        <div class="text-red-400 mb-2">⚠️</div>
                        <p class="text-gray-400">ダッシュボードの読み込みに失敗しました</p>
                        <p class="text-gray-500 text-sm mt-1">認証が必要な可能性があります</p>
                      </div>
                    `;
                  }
                }}
              />
              
              {/* フォールバック: objectタグ */}
              <object
                key={`grafana-object-${grafanaRangeMode}-${grafanaTimeSpan}-${absoluteFrom}-${absoluteTo}`}
                data={getGrafanaUrl()}
                type="text/html"
                className="w-full h-full border-0 relative z-5"
                style={{ display: 'none' }}
                onLoad={() => {
                  // objectタグが読み込まれた場合、iframeを非表示にしてobjectを表示
                  const iframeElement = document.querySelector('iframe');
                  const objectElement = document.querySelector('object');
                  const loadingElement = document.querySelector('.grafana-loading');
                  
                  if (iframeElement && objectElement && loadingElement) {
                    iframeElement.style.display = 'none';
                    objectElement.style.display = 'block';
                    loadingElement.classList.add('hidden');
                  }
                }}
              />
            </div>
            <div className="mt-2 text-sm text-gray-400 flex justify-between items-center">
              <span>センサー: {asset.name}</span>
              <div className="flex space-x-2">
                <a 
                  href={getGrafanaUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline text-xs"
                >
                  新しいタブで開く
                </a>
                <span className="text-gray-500">|</span>
                <a 
                  href={`https://glicocmmsbeta.org/d/deewnp24piz668d/influxdb?orgId=1&timezone=browser&var-AssetId=${encodeURIComponent(asset.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-400 hover:text-green-300 underline text-xs"
                >
                  フルダッシュボード
                </a>
              </div>
            </div>
          </div>

          {/* アラート状態表示 */}
          {asset.isAlertActive && (
            <div className="bg-red-900/20 border border-red-500/30 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <AlertTriangle className="text-red-400 mr-3" size={24} />
                  <div>
                    <h3 className="text-red-400 font-semibold">Alert Active</h3>
                    <p className="text-red-300 text-sm">
                      Triggered at: {asset.alertTriggeredAt ? new Date(asset.alertTriggeredAt).toLocaleString() : 'Unknown'}
                    </p>
                    {/* Notebookリンク表示 */}
                    {asset.activeAlertNotebookPath && (
                      <div className="mt-2">
                        <div className="text-red-400 text-xs mb-1">Executed Notebook:</div>
                        <a 
                          href={asset.activeAlertNotebookUrl || `https://glicocmms-cbm-notebooks.org/notebooks/${asset.activeAlertNotebookPath}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 text-xs underline flex items-center"
                        >
                          <ExternalLink size={12} className="mr-1" />
                          {asset.activeAlertNotebookPath}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-red-400 text-sm">Active Alert Rule</div>
                  <div className="text-red-300 font-mono text-xs">
                    {asset.activeAlertRule || 'Unknown'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-gray-900 p-4 rounded-lg">
            <h3 className="text-white font-semibold mb-3">アラートステータス</h3>
            <div className="space-y-2">
              {asset.alertRules.map(rule => (
                <div key={rule.id} className="flex items-center justify-between">
                  <span className="text-white">{rule.name}</span>
                  <div className="flex items-center space-x-2">
                    {asset.isAlertActive && asset.activeAlertRule === rule.id && (
                      <div className="px-2 py-1 bg-red-900 text-red-300 rounded text-xs">
                        TRIGGERED
                      </div>
                    )}
                    <div className={`px-2 py-1 rounded text-xs ${
                      rule.isActive 
                        ? 'bg-green-900 text-green-300' 
                        : 'bg-gray-700 text-gray-400'
                    }`}>
                      {rule.isActive ? 'Active' : 'Inactive'}
                    </div>
                  </div>
                </div>
              ))}
              {asset.alertRules.length === 0 && (
                <p className="text-gray-400">No alert rules configured</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'rules') {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Alert Rules</h3>
            {isEditMode && (
              <button
                onClick={addNewRule}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center"
              >
                <AlertTriangle size={16} className="mr-2" />
                新規ルール
              </button>
            )}
          </div>

          {asset.alertRules.map((rule, index) => (
            <div key={rule.id}>
              <AlertRuleBuilder
                rule={rule}
                onRuleUpdate={updateRule}
                onSave={handleRuleSave}
                onCancel={() => {
                  // 最終保存時点のルールへ戻す
                  stableOnAssetUpdate({
                    ...asset,
                    alertRules: lastSavedRulesRef.current
                  });
                }}
                isEditMode={isEditMode}
                ruleIndex={index + 1}
                mqttMessages={mqttMessages} // MQTTメッセージを追加
                assetTags={asset.tags || []}
              />
              {index < asset.alertRules.length - 1 && (
                <div className="my-8 border-t border-gray-600 relative">
                  <div className="absolute left-1/2 transform -translate-x-1/2 -top-3 bg-gray-800 px-4">
                    <div className="text-gray-500 text-sm font-medium">次のルール</div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {asset.alertRules.length === 0 && (
            <div className="text-center py-12">
              <AlertTriangle className="mx-auto text-gray-500 mb-4" size={48} />
              <p className="text-gray-400 mb-4">No alert rules configured</p>
              {isEditMode && (
                <button
                  onClick={addNewRule}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded"
                >
                  Create Your First Rule
                </button>
              )}
            </div>
          )}
        </div>
      );
    }

    if (activeTab === 'logs') {
      return (
        <div className="space-y-6 min-w-0">
          <AlertRuleExecutionLogs assetId={asset.id} />
        </div>
      );
    }

    if (activeTab === 'tags') {
      // ツリー描画（チェックボックス付）
      const renderJsonTree = (node: any, basePath: string = ''): JSX.Element | null => {
        if (node === null || node === undefined) return null;

        // プリミティブ値
        if (typeof node !== 'object') {
          const path = basePath;
          const checked = selectedJsonPaths.has(path);
          return (
            <div className="flex items-center space-x-2 py-1" key={path}>
              <input
                type="checkbox"
                className="form-checkbox h-4 w-4 text-blue-600"
                checked={checked}
                onChange={() => {
                  const next = new Set(selectedJsonPaths);
                  if (checked) next.delete(path); else next.add(path);
                  setSelectedJsonPaths(next);
                }}
              />
              <code className="text-gray-300 text-xs">{path}</code>
            </div>
          );
        }

        // 配列
        if (Array.isArray(node)) {
          const path = basePath;
          const checked = selectedJsonPaths.has(path);
          return (
            <div className="ml-3" key={path}>
              <div className="flex items-center space-x-2 py-1">
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 text-blue-600"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selectedJsonPaths);
                    if (checked) next.delete(path); else next.add(path);
                    setSelectedJsonPaths(next);
                  }}
                />
                <code className="text-gray-300 text-xs">{path}[]</code>
              </div>
            </div>
          );
        }

        // オブジェクト
        const entries = Object.entries(node as Record<string, any>);
        return (
          <div className="ml-3" key={basePath || 'root'}>
            {basePath && (
              <div className="flex items-center space-x-2 py-1">
                <input
                  type="checkbox"
                  className="form-checkbox h-4 w-4 text-blue-600"
                  checked={selectedJsonPaths.has(basePath)}
                  onChange={() => {
                    const next = new Set(selectedJsonPaths);
                    if (next.has(basePath)) next.delete(basePath); else next.add(basePath);
                    setSelectedJsonPaths(next);
                  }}
                />
                <code className="text-gray-300 text-xs">{basePath}</code>
              </div>
            )}
            <div>
              {entries.map(([k, v]) => {
                const nextPath = basePath ? `${basePath}.${k}` : k;
                return (
                  <div key={nextPath}>
                    {renderJsonTree(v, nextPath)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      };

      

      const tags = asset.tags || [];
      return (
        <div className="space-y-6">
          <div className="bg-gray-900 p-6 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">センサータグ</h3>
              <div></div>
            </div>

            {/* 補足説明 */}
            <div className="mb-4 text-sm text-gray-300 bg-gray-800 border border-gray-700 rounded p-3">
              <div className="font-medium text-gray-200 mb-1">タグの活用について <span className="text-xs text-gray-400 align-middle">（任意設定・後から追加/編集可能）</span></div>
              <ul className="list-disc list-inside space-y-1 text-gray-400">
                <li>タグを登録しておくと、アラートルールで参照する項目（例: <code className="text-gray-300">value.adc_avg</code>）を簡単に選べます。</li>
                <li>同じアセット内や他設定でも一貫したキー名を使えるため、設定ミスや入力の手間を減らせます。</li>
                <li>将来的にダッシュボードやノートブック連携でパラメータを指定する際も、登録済みタグから選択できて便利です。</li>
              </ul>
            </div>

            {isEditMode && (
              <div className="bg-gray-800 rounded-md p-4 mb-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-gray-200 font-medium text-sm">JSONからタグを取り込み</div>
                  <div className="space-x-2">
                    <button
                      className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                      onClick={() => {
                        if (asset.mqttTopic && mqttMessages[asset.mqttTopic]) {
                          const src = mqttMessages[asset.mqttTopic];
                          const text = typeof src === 'string' ? src : JSON.stringify(src, null, 2);
                          if (jsonInputRef.current) jsonInputRef.current.value = text;
                          // MQTTからの読み込み時のみ即時解析
                          try {
                            const obj = typeof src === 'string' ? JSON.parse(src) : src;
                            setParsedJson(obj);
                            setJsonError(null);
                          } catch (e) {
                            setParsedJson(null);
                            setJsonError('JSONの構文エラーです');
                          }
                        } else {
                          alert('最新のMQTTメッセージがありません');
                        }
                      }}
                    >最新MQTTから貼り付け</button>
                    <button
                      className="bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs"
                      onClick={parseJsonNow}
                    >解析</button>
                    <button
                      className="bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded text-xs"
                      onClick={() => { setSelectedJsonPaths(new Set()); }}
                    >選択クリア</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <textarea
                    ref={jsonInputRef}
                    defaultValue={''}
                    placeholder='MQTTからのJSON、または手動で貼り付け'
                    className="w-full h-40 bg-gray-900 text-green-300 px-3 py-2 rounded border border-gray-700 focus:border-blue-500 focus:outline-none text-xs font-mono"
                  />
                  <div className="h-40 overflow-y-auto bg-gray-900 border border-gray-700 rounded p-2">
                    {!parsedJson && !jsonError && (
                      <div className="text-gray-500 text-xs">有効なJSONを貼り付けると、ここにチェックボックスが表示されます</div>
                    )}
                    {jsonError && (
                      <div className="text-red-400 text-xs">{jsonError}</div>
                    )}
                    {treeView}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
                    onClick={() => {
                      if (selectedJsonPaths.size === 0) {
                        alert('取り込むキーを選択してください');
                        return;
                      }
                      const newTags = Array.from(selectedJsonPaths).map(path => ({ label: path, key: path, tagType: 'analog' as const, tagId: generateUUID() }));
                      const map = new Map<string, { label: string; key: string }>();
                      [...(asset.tags || []), ...newTags].forEach(t => { if (!map.has(t.key)) map.set(t.key, t); });
                      const updated = { ...asset, tags: Array.from(map.values()) };
                      onAssetUpdate(updated);
                      alert('選択したキーをタグに取り込みました');
                    }}
                  >取り込み</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-300 border-b border-gray-700">
                      <th className="py-2 pr-4">ラベル</th>
                      <th className="py-2 pr-4">MQTT key</th>
                      <th className="py-2 pr-4">タイプ</th>
                      <th className="py-2 pr-2">単位（任意）</th>
                      <th className="py-2 pr-4">説明（任意）</th>
                      <th className="py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tags.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-4 text-gray-400">タグは未登録です。"タグ情報取得" を押して次のMQTT受信から自動登録します。</td>
                      </tr>
                    ) : (
                      tags.map((t, idx) => (
                        <tr key={`tag-${idx}`} className="border-b border-gray-800">
                          <td className="py-2 pr-4 align-top">
                            {isEditMode ? (
                              <input
                                value={t.label}
                                onChange={(e) => {
                                  const next = [...(asset.tags || [])];
                                  next[idx] = { ...next[idx], label: e.target.value };
                                  onAssetUpdate({ ...asset, tags: next });
                                }}
                                className="w-full bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                              />
                            ) : (
                              <span className="text-white">{t.label}</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 align-top">
                            {isEditMode ? (
                              <input
                                value={t.key}
                                onChange={(e) => {
                                  const next = [...(asset.tags || [])];
                                  next[idx] = { ...next[idx], key: e.target.value };
                                  onAssetUpdate({ ...asset, tags: next });
                                }}
                                className="w-full bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none font-mono"
                              />
                            ) : (
                              <code className="text-gray-300 font-mono">{t.key}</code>
                            )}
                          </td>
                          <td className="py-2 pr-4 align-top">
                            {isEditMode ? (
                              <select
                                value={t.tagType || 'analog'}
                                onChange={(e) => {
                                  const next = [...(asset.tags || [])];
                                  next[idx] = { ...next[idx], tagType: (e.target.value as 'analog' | 'cumulative') };
                                  onAssetUpdate({ ...asset, tags: next });
                                }}
                                className="w-full bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-xs"
                              >
                                <option value="analog">アナログ値</option>
                                <option value="cumulative">積算値</option>
                              </select>
                            ) : (
                              <span className="text-gray-300 text-xs">{(t.tagType || 'analog') === 'analog' ? 'アナログ値' : '積算値'}</span>
                            )}
                          </td>
                          <td className="py-2 pr-2 align-top">
                            {isEditMode ? (
                              <input
                                value={t.unit || ''}
                                onChange={(e) => {
                                  const next = [...(asset.tags || [])];
                                  next[idx] = { ...next[idx], unit: e.target.value };
                                  onAssetUpdate({ ...asset, tags: next });
                                }}
                                placeholder="例: °C, kPa"
                                className="w-full bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-xs"
                              />
                            ) : (
                              <span className="text-gray-300 text-xs">{t.unit || '-'}</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 align-top">
                            {isEditMode ? (
                              <input
                                value={t.note || ''}
                                onChange={(e) => {
                                  const next = [...(asset.tags || [])];
                                  next[idx] = { ...next[idx], note: e.target.value };
                                  onAssetUpdate({ ...asset, tags: next });
                                }}
                                placeholder="用途や補足説明（任意）"
                                className="w-full bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-xs"
                              />
                            ) : (
                              <span className="text-gray-300 text-xs break-words max-w-xs inline-block">{t.note || '-'}</span>
                            )}
                          </td>
                          <td className="py-2 align-top text-right">
                            <div className="flex items-center justify-end space-x-2 whitespace-nowrap">
                              {(t.tagType || 'analog') === 'cumulative' && (
                                <>
                                  <button
                                    onClick={async () => {
                                    try {
                                      // 現在値の解決
                                      const resolvePath = (obj: any, path: string) => {
                                        if (!obj || !path) return undefined;
                                        const parts = String(path).split('.');
                                        let cur = obj;
                                        for (const part of parts) {
                                          if (cur == null) return undefined;
                                          cur = cur[part];
                                        }
                                        return cur;
                                      };
                                      const msg = asset.mqttTopic ? mqttMessages[asset.mqttTopic] : null;
                                      let parsedPayload: any = undefined;
                                      if (msg) {
                                        const raw = (msg.value !== undefined ? msg.value : msg);
                                        if (typeof raw === 'string') {
                                          try { parsedPayload = JSON.parse(raw); } catch { parsedPayload = raw; }
                                        } else {
                                          parsedPayload = raw;
                                        }
                                      }
                                      // t.keyが'value.'で始まる場合は{ value: payload }をルートにして解決
                                      let sourceObj: any = undefined;
                                      if (t.key && String(t.key).startsWith('value.')) {
                                        sourceObj = { value: parsedPayload };
                                      } else {
                                        sourceObj = parsedPayload;
                                      }
                                      const currentValue = sourceObj ? resolvePath(sourceObj, t.key) : undefined;
                                      const historyEntry = { timestamp: new Date().toISOString(), value: (currentValue as any) ?? 'N/A' };
                                      // 履歴はAPIに保存（資産JSONには持たない）
                                      if (!t.tagId) {
                                        // 万一tagIdがなければ付与して保存
                                        const next = [...(asset.tags || [])];
                                        next[idx] = { ...next[idx], tagId: generateUUID() };
                                        const updated = { ...asset, tags: next };
                                        onAssetUpdate(updated);
                                        await saveAssetToDB(updated);
                                      }
                                      const payload = { assetId: asset.id, resetAt: historyEntry.timestamp, value: historyEntry.value };
                                      const tryPost = async (url: string, body: any) => {
                                        const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                                        return resp;
                                      };
                                      let resp = await tryPost(`/api/tags/${t.tagId || ''}/reset-events`, payload);
                                      if (resp.status === 404) {
                                        // route missing on backend → fallback to compat endpoint
                                        resp = await tryPost(`/api/tags/reset-events`, { tagId: t.tagId, ...payload });
                                      }
                                      if (resp.status === 404) {
                                        // dev proxy未適用時 or backend別ポートへ直叩き
                                        resp = await tryPost(`http://localhost:3001/api/tags/${t.tagId || ''}/reset-events`, payload);
                                      }
                                      if (resp.status === 404) {
                                        resp = await tryPost(`http://localhost:3001/api/tags/reset-events`, { tagId: t.tagId, ...payload });
                                      }
                                      if (!resp.ok) {
                                        try { const j = await resp.json(); throw new Error(j.error || 'failed'); } catch {
                                          throw new Error('failed');
                                        }
                                      }
                                      alert('リセット履歴を保存しました');
                                    } catch (_) {
                                      alert('リセット履歴の保存に失敗しました');
                                    }
                                  }}
                                    className="bg-yellow-700 hover:bg-yellow-600 text-white px-3 py-1 rounded text-xs inline-flex items-center whitespace-nowrap shrink-0"
                                  >リセット</button>
                                  <button
                                    onClick={() => { if (t.tagId) openHistory(t.tagId, t.label || t.key); }}
                                    className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs inline-flex items-center whitespace-nowrap shrink-0"
                                  >履歴</button>
                                </>
                              )}
                              {isEditMode && (
                                <button
                                  onClick={() => {
                                    const next = (asset.tags || []).filter((_, i) => i !== idx);
                                    onAssetUpdate({ ...asset, tags: next });
                                  }}
                                  className="text-red-300 hover:text-red-200 text-xs"
                                >削除</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {isEditMode && (
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => {
                      const next = [...(asset.tags || []), { label: '', key: '' }];
                      onAssetUpdate({ ...asset, tags: next });
                    }}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded text-sm"
                  >タグを追加</button>
                  <button
                    onClick={async () => {
                      try {
                        const ok = await saveAssetToDB(asset);
                        if (!ok) return alert('タグの保存に失敗しました');
                        alert('タグを保存しました');
                      } catch (e) {
                        console.error(e);
                        alert('タグの保存に失敗しました');
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
                  >保存</button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'settings') {
      return (
        <div className="space-y-6">
          <div className="bg-gray-900 p-6 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Asset Configuration</h3>
              {isEditMode && (
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => {
                      // ローカル状態を元のassetに戻す
                      setLocalAsset(asset);
                    }}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded flex items-center"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center"
                  >
                    <Settings size={16} className="mr-2" />
                    保存
                  </button>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-2">Asset ID</label>
                <div className="w-full bg-gray-700 text-gray-400 px-3 py-2 rounded font-mono text-sm">
                  {asset.id}
                </div>
                <p className="text-gray-500 text-xs mt-1">このIDは変更できません</p>
              </div>

              <div>
                <label className="block text-gray-300 mb-2">Asset Name</label>
                {isEditMode ? (
                  <input
                    type="text"
                    value={localAsset.name}
                    onChange={(e) => setLocalAsset({ ...localAsset, name: e.target.value })}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                ) : (
                  <div className="w-full bg-gray-700 text-white px-3 py-2 rounded">
                    {asset.name}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-gray-300 mb-2">Asset Type</label>
                {isEditMode ? (
                  <select
                    value={localAsset.type}
                    onChange={(e) => setLocalAsset({ ...localAsset, type: e.target.value as AssetType })}
                    className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  >
                    {ASSET_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full bg-gray-700 text-white px-3 py-2 rounded">
                    {getAssetTypeLabel(asset.type)}
                  </div>
                )}
              </div>

              {/* データソースタイプ表示 */}
              <div>
                <label className="block text-gray-300 mb-2">Data Source Type</label>
                {isEditMode ? (
              <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setLocalAsset({ ...localAsset, dataSourceType: 'mqtt' })}
                      className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                        localAsset.dataSourceType === 'mqtt'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-600 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <Wifi size={16} className="mr-2" /> MQTT
                    </button>
                  </div>
                ) : (
                  <div className="w-full bg-gray-700 text-white px-3 py-2 rounded">MQTT</div>
                )}
              </div>

              {/* MQTTトピック (MQTTの場合のみ表示) */}
              {localAsset.dataSourceType === 'mqtt' && (
                <div>
                  <label className="block text-gray-300 mb-2">MQTT Topic</label>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={localAsset.mqttTopic || ''}
                      onChange={(e) => setLocalAsset({ ...localAsset, mqttTopic: e.target.value })}
                      className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                      placeholder="factory/line/asset"
                    />
                  ) : (
                    <div className="w-full bg-gray-700 text-white px-3 py-2 rounded">
                      {asset.mqttTopic || 'Not configured'}
                    </div>
                  )}
                </div>
              )}

              {/* Thingsboard UI は削除 */}

              <div>
                <label className="block text-gray-300 mb-2">Status</label>
                <div className="w-full bg-gray-700 text-white px-3 py-2 rounded capitalize">
                  {asset.status}
                </div>
                <p className="text-gray-500 text-xs mt-1">ステータスは自動的に更新されます</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  }, [activeTab, formattedValue, lastUpdate, asset, mqttMessages, publish, isEditMode, addNewRule, updateRule, handleRuleSave, stableOnAssetUpdate, isRawDataExpanded, sensorData]);

  return (
    <div className="bg-gray-800 h-full min-w-0 overflow-hidden relative">
      {/* コピー完了ポップアップ */}
      {showCopyPopup && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center space-x-2 animate-pulse">
          <Copy size={16} />
          <span className="text-sm font-medium">アセットIDをコピーしました</span>
        </div>
      )}
      
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Cpu className="text-blue-400 mr-3" size={24} />
            <div>
              <h2 className="text-2xl font-bold text-white">{asset.name}</h2>
              <div className="flex items-center space-x-4">
                <p className="text-gray-400">{getAssetTypeLabel(asset.type)}</p>
                <div className="flex items-center text-gray-500 text-sm">
                  <Hash size={12} className="mr-1" />
                  <span className="font-mono">{asset.id}</span>
                  <button
                    onClick={handleCopyAssetId}
                    className="ml-2 text-gray-400 hover:text-gray-300 p-1 rounded transition-colors"
                    title="IDをコピー"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              {statusIcon}
              <span className="ml-2 text-white capitalize">{asset.status}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex border-b border-gray-700">
        {[ 
          { key: 'overview', label: '概要', icon: Activity },
          { key: 'rules', label: 'アラートルール', icon: AlertTriangle },
          { key: 'logs', label: '実行ログ', icon: FileText },
          { key: 'tags', label: 'タグ', icon: Hash },
          { key: 'settings', label: '設定', icon: Settings }
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`flex items-center px-6 py-3 border-b-2 transition-colors ${
              activeTab === key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            <Icon size={16} className="mr-2" />
            {label}
          </button>
        ))}
      </div>

      <div className="p-6 min-w-0">
        {tabContent}
      </div>

      {/* リセット履歴モーダル */}
      {historyOpen && historyTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-white font-semibold text-sm">リセット履歴: {historyTag.label}</div>
              <button className="text-gray-400 hover:text-white text-sm" onClick={() => setHistoryOpen(false)}>閉じる</button>
            </div>
            {historyLoading ? (
              <div className="text-gray-400 text-sm">読み込み中...</div>
            ) : historyError ? (
              <div className="text-red-400 text-sm">{historyError}</div>
            ) : (
              <div className="max-h-64 overflow-y-auto border border-gray-800 rounded">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-300 border-b border-gray-800">
                      <th className="py-2 px-3">リセット時刻</th>
                      <th className="py-2 px-3">値</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.length === 0 ? (
                      <tr><td colSpan={2} className="py-3 px-3 text-gray-500">履歴はありません</td></tr>
                    ) : (
                      historyRows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="py-2 px-3 text-gray-300">{new Date(row.resetAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td>
                          <td className="py-2 px-3 text-green-300 font-mono break-all">{String(row.value)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
});