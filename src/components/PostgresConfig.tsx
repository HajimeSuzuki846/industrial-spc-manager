import React, { useState, useEffect } from 'react';
import { Database, TestTube, Save, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

interface PostgresConfigProps {
  onConfigUpdate?: (config: PostgresConfig) => void;
}

export const PostgresConfig: React.FC<PostgresConfigProps> = ({
  onConfigUpdate
}) => {
  const [config, setConfig] = useState<PostgresConfig>({
    host: 'localhost',
    port: 5432,
    database: 'asset_manager',
    user: 'postgres',
    password: ''
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 設定を読み込み
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/postgres/config');
      if (response.ok) {
        const savedConfig = await response.json();
        if (savedConfig) {
          setConfig({
            host: savedConfig.host,
            port: savedConfig.port,
            database: savedConfig.database,
            user: savedConfig.user,
            password: savedConfig.password
          });
          setIsConnected(true);
        }
      }
    } catch (error) {
      console.error('Failed to load PostgreSQL config:', error);
    }
  };

  const restartBackend = async () => {
    setIsRestarting(true);
    setMessage(null);
    
    try {
      // まずバックエンドが起動しているかチェック
      let isServerRunning = false;
      try {
        const healthCheck = await fetch('/api/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        isServerRunning = healthCheck.ok;
      } catch (error) {
        // サーバーが停止している場合
        isServerRunning = false;
      }
      
      if (isServerRunning) {
        // サーバーが起動している場合は自動再起動APIを使用
        setMessage({ type: 'success', text: 'Backend is running. Initiating auto restart...' });
        
        const response = await fetch('/api/auto-restart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
          setMessage({ type: 'success', text: 'Auto restart initiated. Please wait a moment...' });
        } else {
          throw new Error('Failed to initiate auto restart');
        }
      } else {
        // サーバーが停止している場合は自動再起動APIを使用
        setMessage({ type: 'success', text: 'Backend is stopped. Starting server automatically...' });
        
        // 自動再起動APIを呼び出し（サーバーが停止していても動作する）
        try {
          const response = await fetch('/api/auto-restart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (response.ok) {
            setMessage({ type: 'success', text: 'Auto restart initiated. Please wait a moment...' });
          } else {
            throw new Error('Failed to initiate auto restart');
          }
        } catch (error) {
          // サーバーが完全に停止している場合は、手動で起動を試行
          setMessage({ type: 'success', text: 'Server is completely stopped. Please run: npm run restart-auto' });
          setIsRestarting(false);
          return;
        }
      }
      
      // 少し待ってから接続状態を確認
      setTimeout(async () => {
        try {
          await loadConfig();
          setMessage({ type: 'success', text: 'Backend is running successfully!' });
        } catch (error) {
          setMessage({ type: 'error', text: 'Backend is running, but connection test failed' });
        }
        setIsRestarting(false);
      }, 5000);
      
    } catch (error) {
      console.error('Restart error:', error);
      setMessage({ type: 'error', text: 'Failed to restart backend server' });
      setIsRestarting(false);
    }
  };

  const handleInputChange = (field: keyof PostgresConfig, value: string | number) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const testConnection = async () => {
    setIsTesting(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/postgres/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'PostgreSQL connection successful!' });
        setIsConnected(true);
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: `Connection failed: ${error.details || error.error}` });
        setIsConnected(false);
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to test connection' });
      setIsConnected(false);
    } finally {
      setIsTesting(false);
    }
  };

  const saveConfig = async () => {
    setIsSaving(true);
    setMessage(null);
    
    try {
      const response = await fetch('/api/postgres/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });
      
      if (response.ok) {
        setMessage({ type: 'success', text: 'PostgreSQL configuration saved successfully!' });
        setIsConnected(true);
        if (onConfigUpdate) {
          onConfigUpdate(config);
        }
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: `Failed to save config: ${error.details || error.error}` });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save configuration' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center">
          <Database className="mr-2" size={24} />
          PostgreSQL Configuration
        </h2>
        <div className="flex items-center space-x-2">
          {isConnected ? (
            <div className="flex items-center text-green-400">
              <CheckCircle size={16} className="mr-1" />
              Connected
            </div>
          ) : (
            <div className="flex items-center text-gray-400">
              <AlertCircle size={16} className="mr-1" />
              Disconnected
            </div>
          )}
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-500/10 border border-green-500/20' 
            : 'bg-red-500/10 border border-red-500/20'
        }`}>
          <div className={`flex items-center text-sm ${
            message.type === 'success' ? 'text-green-400' : 'text-red-400'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="mr-2" size={16} />
            ) : (
              <AlertCircle className="mr-2" size={16} />
            )}
            {message.text}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Host
            </label>
            <input
              type="text"
              value={config.host}
              onChange={(e) => handleInputChange('host', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="localhost"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Port
            </label>
            <input
              type="number"
              value={config.port}
              onChange={(e) => handleInputChange('port', parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="5432"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Database Name
          </label>
          <input
            type="text"
            value={config.database}
            onChange={(e) => handleInputChange('database', e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="asset_manager"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={config.user}
              onChange={(e) => handleInputChange('user', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="postgres"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={config.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="password"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mt-6">
        {/* 目立たない再起動ボタン */}
        <div className="flex items-center space-x-1">
          <button
            onClick={restartBackend}
            disabled={isRestarting}
            className={`flex items-center px-2 py-1 text-xs rounded border border-gray-600 text-gray-500 hover:text-gray-300 hover:border-gray-500 hover:bg-gray-800 transition-all duration-200 ${
              isRestarting ? 'cursor-not-allowed opacity-50' : ''
            }`}
            title="Restart Backend Server (Development Only)"
          >
            <RefreshCw size={10} className={`mr-1 ${isRestarting ? 'animate-spin' : ''}`} />
            {isRestarting ? 'Restarting...' : 'Restart'}
          </button>
          <button
            onClick={() => {
              setMessage({ type: 'success', text: 'Auto restart: npm run restart-auto | Manual: npm run restart-ps' });
            }}
            className="flex items-center px-1 py-1 text-xs rounded border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-500 hover:bg-gray-800 transition-all duration-200"
            title="PowerShell Restart Scripts"
          >
            <span className="text-xs">PS</span>
          </button>
        </div>

        {/* メインボタン群 */}
        <div className="flex space-x-3">
          <button
            onClick={testConnection}
            disabled={isTesting}
            className={`flex items-center px-4 py-2 rounded-lg text-white ${
              isTesting
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            <TestTube size={16} className="mr-2" />
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            onClick={saveConfig}
            disabled={isSaving}
            className={`flex items-center px-4 py-2 rounded-lg text-white ${
              isSaving
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            <Save size={16} className="mr-2" />
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      <div className="mt-6 p-4 bg-gray-900 rounded-lg">
        <h3 className="text-white font-semibold mb-2">Database Information</h3>
        <div className="text-sm text-gray-400 space-y-1">
          <p>• Host: {config.host}:{config.port}</p>
          <p>• Database: {config.database}</p>
          <p>• User: {config.user}</p>
          <p>• Status: {isConnected ? 'Connected' : 'Disconnected'}</p>
        </div>
      </div>
    </div>
  );
};
