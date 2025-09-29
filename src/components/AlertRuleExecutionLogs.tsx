import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertTriangle, Search, RefreshCw, Eye, X, Trash2 } from 'lucide-react';

interface AlertRuleExecutionLog {
  id: number;
  ruleId: string;
  assetId: string;
  ruleName: string;
  assetName: string;
  executionType: 'realtime' | 'scheduled';
  executionTime: string;
  executionDuration: number;
  status: 'success' | 'error' | 'warning';
  conditionsEvaluated: any[];
  conditionsResult: Record<string, boolean>;
  triggeredAlertId?: string;
  errorMessage?: string;
  executionContext: any;
  createdAt: string;
}

interface AlertRuleExecutionLogsProps {
  assetId?: string;
  ruleId?: string;
}

export const AlertRuleExecutionLogs: React.FC<AlertRuleExecutionLogsProps> = ({
  assetId,
  ruleId
}) => {
  const [logs, setLogs] = useState<AlertRuleExecutionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AlertRuleExecutionLog | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ...(assetId && { assetId }),
        ...(ruleId && { ruleId }),
        ...(searchTerm && { search: searchTerm })
      });

      const response = await fetch(`/api/alert-rules/execution-logs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs || []);
      } else {
        console.error('Failed to fetch execution logs');
      }
    } catch (error) {
      console.error('Error fetching execution logs:', error);
      // テスト用のダミーデータ
      setLogs([
        {
          id: 1,
          ruleId: 'rule1',
          assetId: 'asset1',
          ruleName: 'テストルール1',
          assetName: 'テストアセット1',
          executionType: 'scheduled',
          executionTime: new Date().toISOString(),
          executionDuration: 1500,
          status: 'success',
          conditionsEvaluated: [],
          conditionsResult: {},
          executionContext: {},
          createdAt: new Date().toISOString()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [searchTerm, assetId, ruleId]);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'success':
        return { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/20' };
      case 'error':
        return { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/20' };
      case 'warning':
        return { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-900/20' };
      default:
        return { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-900/20' };
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDuration = (duration: number) => {
    if (duration < 1000) {
      return `${duration}ms`;
    }
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const showLogDetails = (log: AlertRuleExecutionLog) => {
    setSelectedLog(log);
    setShowDetails(true);
  };

  const resetLogs = async () => {
    if (!assetId) {
      alert('アセットIDが指定されていません');
      return;
    }

    if (!confirm('このアセットの実行ログをすべて削除しますか？この操作は取り消せません。')) {
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch('/api/alert-rules/execution-logs', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assetId }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`実行ログをリセットしました。削除されたログ数: ${result.deletedCount}`);
        // ログを再取得
        await fetchLogs();
      } else {
        const error = await response.json();
        alert(`実行ログのリセットに失敗しました: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error resetting execution logs:', error);
      alert('実行ログのリセット中にエラーが発生しました');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold text-white">AlertRule実行ログ</h3>
        <div className="flex items-center space-x-3">
          {assetId && (
            <button
              onClick={resetLogs}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              disabled={isResetting || loading}
            >
              <Trash2 size={16} className={isResetting ? 'animate-pulse' : ''} />
              <span>{isResetting ? 'リセット中...' : 'ログをリセット'}</span>
            </button>
          )}
          <button
            onClick={fetchLogs}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>更新</span>
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center space-x-2">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            placeholder="ルール名やアセット名で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none flex-1"
          />
        </div>
      </div>

      <div className="bg-gray-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-600">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  ステータス
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  実行時間
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  ルール名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  アセット
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  実行時間
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                  アクション
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-600">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    読み込み中...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    実行ログがありません
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const statusStyle = getStatusStyle(log.status);
                  const StatusIcon = statusStyle.icon;
                  
                  return (
                    <tr key={log.id} className="hover:bg-gray-600/50">
                      <td className="px-4 py-4">
                        <div className={`flex items-center space-x-2 ${statusStyle.bg} px-2 py-1 rounded-lg w-fit`}>
                          <StatusIcon size={16} className={statusStyle.color} />
                          <span className={`text-sm font-medium ${statusStyle.color}`}>
                            {log.status === 'success' ? '成功' : 
                             log.status === 'error' ? 'エラー' : '警告'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-300">
                        {formatTime(log.executionTime)}
                      </td>
                      <td className="px-4 py-4 text-sm text-white font-medium">
                        {log.ruleName}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-300">
                        {log.assetName}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-300">
                        {formatDuration(log.executionDuration)}
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => showLogDetails(log)}
                          className="flex items-center space-x-1 px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                        >
                          <Eye size={14} />
                          <span className="text-xs">詳細</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showDetails && selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-semibold text-white">実行ログ詳細</h4>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 text-sm mb-1">ルール名</label>
                  <div className="text-white">{selectedLog.ruleName}</div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">アセット名</label>
                  <div className="text-white">{selectedLog.assetName}</div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">実行時間</label>
                  <div className="text-white">{formatTime(selectedLog.executionTime)}</div>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-1">実行時間</label>
                  <div className="text-white">{formatDuration(selectedLog.executionDuration)}</div>
                </div>
              </div>

              {selectedLog.errorMessage && (
                <div>
                  <label className="block text-gray-400 text-sm mb-1">エラーメッセージ</label>
                  <div className="bg-red-900/20 border border-red-500 rounded-lg p-3 text-red-400">
                    {selectedLog.errorMessage}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-gray-400 text-sm mb-1">実行コンテキスト</label>
                <div className="bg-gray-700 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <pre className="text-gray-300 text-sm">
                    {JSON.stringify(selectedLog.executionContext, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



