import React, { useState, useEffect } from 'react';

interface InfluxDBConfig {
  url: string;
  token: string;
  database: string;
}

interface InfluxDBConfigProps {
  onConfigChange?: (config: InfluxDBConfig | null) => void;
}

const InfluxDBConfig: React.FC<InfluxDBConfigProps> = ({ onConfigChange }) => {
  // 本番環境でのデフォルトURLを設定
  const getDefaultUrl = () => {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      // 本番環境の場合、現在のドメインを使用
      return `https://${window.location.hostname}/influxdb`;
    }
    return 'http://localhost:8181';
  };

  const [config, setConfig] = useState<InfluxDBConfig>({
    url: getDefaultUrl(),
    token: 'SuperSecretToken',
    database: 'telemetry'
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [setupInfo, setSetupInfo] = useState<any>(null);

  // 設定を読み込み
  useEffect(() => {
    loadConfig();
    checkConnectionStatus();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/influxdb/config');
      if (response.ok) {
        const savedConfig = await response.json();
        if (savedConfig) {
          setConfig({
            url: savedConfig.url || getDefaultUrl(),
            token: savedConfig.token || '',
            database: savedConfig.database || savedConfig.bucket || ''
          });
        }
      }
    } catch (error) {
      console.error('Failed to load InfluxDB config:', error);
    }
  };

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch('/api/influxdb/status');
      if (response.ok) {
        const status = await response.json();
        setIsConnected(status.connected);
      }
    } catch (error) {
      console.error('Failed to check InfluxDB status:', error);
      setIsConnected(false);
    }
  };

  const handleInputChange = (field: keyof InfluxDBConfig, value: string) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
    setError(null);
    setSuccess(null);
  };

  const testConnection = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // v3.4: 直接InfluxDBに問い合わせてデータベースの存在を確認
      const url = `${config.url.replace(/\/$/, '')}/api/v3/configure/database?format=json`;
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.token}`
        }
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status} ${resp.statusText}${text ? `: ${text}` : ''}`);
      }

      const databases = await resp.json();
      const names = Array.isArray(databases)
        ? databases.map((d: any) => d['iox::database']).filter(Boolean)
        : [];

      if (!config.database) {
        setError('データベース名を入力してください');
        setIsConnected(false);
        return;
      }

      if (names.includes(config.database)) {
        setSuccess('InfluxDB接続が成功しました（データベース検出）');
        setIsConnected(true);
      } else {
        setError(`接続は成功しましたが、データベースが見つかりません: ${config.database}`);
        setIsConnected(false);
      }
    } catch (error) {
      console.error('Network error during InfluxDB test:', error);
      setError('ネットワークエラーが発生しました。バックエンドサーバーが起動しているか確認してください。');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const checkSetup = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // v3.4: 直接InfluxDBからデータベース一覧を取得
      const listUrl = `${config.url.replace(/\/$/, '')}/api/v3/configure/database?format=json`;
      const resp = await fetch(listUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${config.token}` }
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status} ${resp.statusText}${text ? `: ${text}` : ''}`);
      }
      const databases = await resp.json();
      const names = Array.isArray(databases)
        ? databases.map((d: any) => d['iox::database']).filter(Boolean)
        : [];
      const setup = { databases: names.map((n: string) => ({ name: n })) };
      setSetupInfo(setup);
      setSuccess('InfluxDB設定情報を取得しました');
      setIsConnected(true);
    } catch (error) {
      console.error('Setup check error:', error);
      setError('設定確認に失敗しました。URL/トークン/プロキシ設定を確認してください。');
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 前後空白を除去
      const trimmed = {
        url: (config.url || '').trim(),
        token: config.token || '',
        database: (config.database || '').trim()
      };
      // Backend expects legacy fields (org, bucket)
      const response = await fetch('/api/influxdb/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmed.url,
          token: trimmed.token,
          org: 'glico',
          bucket: trimmed.database
        })
      });

      let result: any = null;
      try { result = await response.json(); } catch {}

      if (response.ok) {
        setSuccess('InfluxDB設定が保存されました');
        setIsConnected(true);
        onConfigChange?.(trimmed as any);
      } else {
        setError((result && (result.error || result.details)) || '設定の保存に失敗しました');
        setIsConnected(false);
      }
    } catch (error) {
      setError('設定保存中にエラーが発生しました');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveConfig();
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800">InfluxDB設定</h2>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm text-gray-600">
            {isConnected ? '接続済み' : '未接続'}
          </span>
        </div>
      </div>

      {/* 本番環境での設定説明 */}
      {window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">本番環境での設定について</h3>
          <p className="text-xs text-yellow-700 mb-2">
            EC2本番環境では、InfluxDBのURLを <code className="bg-yellow-100 px-1 rounded">https://your-domain.com/influxdb</code> の形式で設定してください。
          </p>
          <p className="text-xs text-yellow-700">
            これはnginxのプロキシ設定により、フロントエンドからInfluxDBにアクセスできるようになります。
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-1">
            InfluxDB URL *
          </label>
          <input
            type="url"
            id="url"
            value={config.url}
            onChange={(e) => handleInputChange('url', e.target.value)}
            placeholder="http://localhost:8181"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            ローカル: http://localhost:8181, EC2本番環境: https://your-domain.com/influxdb
          </p>
        </div>

        <div>
          <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
            API Token
          </label>
          <input
            type="password"
            id="token"
            value={config.token}
            onChange={(e) => handleInputChange('token', e.target.value)}
            placeholder="SuperSecretToken"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            認証が有効な場合のみ必要
          </p>
        </div>

        <div>
          <label htmlFor="database" className="block text-sm font-medium text-gray-700 mb-1">
            データベース名 *
          </label>
          <input
            type="text"
            id="database"
            value={config.database}
            onChange={(e) => handleInputChange('database', e.target.value)}
            placeholder="telemetry"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            InfluxDB v3.4ではデータベースを使用します（旧バケット相当）
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}

        {setupInfo && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <h4 className="text-sm font-medium text-blue-800 mb-2">InfluxDB設定情報</h4>
            <div className="text-xs text-blue-700 space-y-1">
              <div>
                <strong>データベース:</strong> {setupInfo.databases?.map((db: any) => db.name).join(', ') || setupInfo.buckets?.map((bucket: any) => bucket.name).join(', ') || 'なし'}
              </div>
              {setupInfo.users && (
                <div>
                  <strong>ユーザー:</strong> {setupInfo.users?.map((user: any) => user.name).join(', ') || 'なし'}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex space-x-3">
          <button
            type="button"
            onClick={testConnection}
            disabled={isLoading || !config.url || !config.database}
            className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'テスト中...' : '接続テスト'}
          </button>
          
          <button
            type="button"
            onClick={checkSetup}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '確認中...' : '設定確認'}
          </button>
          
          <button
            type="submit"
            disabled={isLoading || !config.url || !config.database}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '保存中...' : '設定保存'}
          </button>
        </div>
      </form>

      <div className="mt-6 p-4 bg-gray-50 rounded-md">
        <h3 className="text-sm font-medium text-gray-700 mb-2">設定例</h3>
        <div className="space-y-2 text-xs text-gray-600">
          <div>
            <strong>ローカル開発 (v3.4):</strong>
            <br />
            URL: http://localhost:8181
            <br />
            Token: SuperSecretToken
            <br />
            データベース: telemetry
          </div>
          <div>
            <strong>EC2本番環境 (v3.4):</strong>
            <br />
            URL: http://your-ec2-ip:8181
            <br />
            Token: SuperSecretToken
            <br />
            データベース: telemetry
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfluxDBConfig;
