import React, { useState, memo } from 'react';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { Shield, Database, Wifi, Activity, AlertTriangle, CheckCircle, XCircle, Loader } from 'lucide-react';

interface SystemStatusCheckProps {
  children: React.ReactNode;
  onShowAdminSettings?: () => void;
}

export const SystemStatusCheck: React.FC<SystemStatusCheckProps> = memo(({ children, onShowAdminSettings }) => {
  console.log('SystemStatusCheck: コンポーネントがレンダリングされました');
  console.log('SystemStatusCheck: onShowAdminSettings:', onShowAdminSettings);
  
  try {
    const { backend, database, mqtt, influxdb, isLoading, errors, checkSystemStatus } = useSystemStatus();
    
    // 初回読み込み完了後は、エラーがない限りローディング画面を表示しない
    const shouldShowLoading = isLoading && !(backend || database || mqtt || influxdb);
    
    // デバッグ用: 状態変化をログ出力
    console.log('SystemStatusCheck: 状態変化', { 
      backend, database, mqtt, influxdb, isLoading, 
      shouldShowLoading, 
      errorCount: Object.keys(errors).length 
    });

    // すべてのサービスが接続されているかチェック
    const allConnected = backend && database && mqtt && influxdb;
    console.log('SystemStatusCheck: システム状態:', { backend, database, mqtt, influxdb, allConnected });
    
    // 管理者設定画面にアクセスするためのフラグ
    const [showAdminOverride, setShowAdminOverride] = useState(false);

  if (shouldShowLoading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader className="mx-auto text-blue-400 mb-4 animate-spin" size={48} />
          <h2 className="text-2xl font-bold text-white mb-2">システム状態を確認中...</h2>
          <p className="text-gray-400">すべてのサービスへの接続を確認しています</p>
        </div>
      </div>
    );
  }

  if (!allConnected) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center mb-6">
            <Shield className="text-red-400 mr-3" size={32} />
            <h1 className="text-2xl font-bold text-white">システム接続エラー</h1>
          </div>
          
          <p className="text-gray-300 mb-6">
            アプリケーションを起動するには、すべてのサービスが正常に接続されている必要があります。
            以下の接続状態を確認し、必要に応じて設定を行ってください。
          </p>

          <div className="space-y-4 mb-6">
            {/* バックエンド */}
            <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
              <div className="flex items-center">
                <Activity className="mr-3" size={20} />
                <span className="text-white font-medium">バックエンド</span>
              </div>
              <div className="flex items-center">
                {backend ? (
                  <CheckCircle className="text-green-400" size={20} />
                ) : (
                  <XCircle className="text-red-400" size={20} />
                )}
              </div>
            </div>

            {/* データベース */}
            <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
              <div className="flex items-center">
                <Database className="mr-3" size={20} />
                <span className="text-white font-medium">PostgreSQL</span>
              </div>
              <div className="flex items-center">
                {database ? (
                  <CheckCircle className="text-green-400" size={20} />
                ) : (
                  <XCircle className="text-red-400" size={20} />
                )}
              </div>
            </div>

            {/* MQTT */}
            <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
              <div className="flex items-center">
                <Wifi className="mr-3" size={20} />
                <span className="text-white font-medium">MQTT</span>
              </div>
              <div className="flex items-center">
                {mqtt ? (
                  <CheckCircle className="text-green-400" size={20} />
                ) : (
                  <XCircle className="text-red-400" size={20} />
                )}
              </div>
            </div>

            {/* InfluxDB */}
            <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
              <div className="flex items-center">
                <Activity className="mr-3" size={20} />
                <span className="text-white font-medium">InfluxDB</span>
              </div>
              <div className="flex items-center">
                {influxdb ? (
                  <CheckCircle className="text-green-400" size={20} />
                ) : (
                  <XCircle className="text-red-400" size={20} />
                )}
              </div>
            </div>
          </div>

          {/* エラーメッセージ */}
          {Object.keys(errors).length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <AlertTriangle className="text-yellow-400 mr-2" size={20} />
                エラー詳細
              </h3>
              <div className="space-y-2">
                {errors.backend && (
                  <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <div className="font-medium text-red-400 mb-1">バックエンド</div>
                    <div className="text-red-300 text-sm">{errors.backend}</div>
                  </div>
                )}
                {errors.database && (
                  <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <div className="font-medium text-red-400 mb-1">PostgreSQL</div>
                    <div className="text-red-300 text-sm">{errors.database}</div>
                  </div>
                )}
                {errors.mqtt && (
                  <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <div className="font-medium text-red-400 mb-1">MQTT</div>
                    <div className="text-red-300 text-sm">{errors.mqtt}</div>
                  </div>
                )}
                {errors.influxdb && (
                  <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <div className="font-medium text-red-400 mb-1">InfluxDB</div>
                    <div className="text-red-300 text-sm">{errors.influxdb}</div>
                  </div>
                )}
              </div>
            </div>
          )}

                     <div className="flex space-x-4">
             <button
               onClick={checkSystemStatus}
               className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
             >
               接続状態を再確認
             </button>
                           <button
                onClick={() => {
                  console.log('管理者設定画面へボタンがクリックされました');
                  console.log('onShowAdminSettings:', onShowAdminSettings);
                  
                  if (onShowAdminSettings) {
                    console.log('onShowAdminSettingsコールバックを実行します');
                    onShowAdminSettings();
                  } else {
                    console.log('フォールバック: localStorageを使用します');
                    // フォールバック: localStorageを使用
                    localStorage.setItem('forceAdminSettings', 'true');
                    // ページ全体のリロードを避けて、明示的に状態チェックを実行
                    checkSystemStatus();
                  }
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                管理者設定画面へ
              </button>
           </div>
        </div>
      </div>
    );
  }

    // すべて接続されている場合は子コンポーネントを表示
    return (
      <>
        {children}
      </>
    );
  } catch (error) {
    console.error('SystemStatusCheck error:', error);
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">エラーが発生しました</h2>
          <p className="text-gray-400">システム状態の確認中にエラーが発生しました</p>
          <button
            onClick={() => checkSystemStatus()}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            状態を再チェック
          </button>
        </div>
      </div>
    );
  }
});
