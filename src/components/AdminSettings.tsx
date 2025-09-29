import React, { useState } from 'react';
import { Settings, Database, Wifi, X, Shield, BarChart3 } from 'lucide-react';
import { MQTTConfig } from './MQTTConfig';
import { PostgresConfig } from './PostgresConfig';
import InfluxDBConfig from './InfluxDBConfig';
import { MQTTConfig as MQTTConfigType } from '../types';

interface AdminSettingsProps {
  onClose: () => void;
  onConfigUpdate?: (config: MQTTConfigType) => void;
  isConnected?: boolean;
  connectionError?: string | null;
  onSystemStatusCheck?: () => void;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ onClose, onConfigUpdate, isConnected = false, connectionError, onSystemStatusCheck }) => {
  const [activeTab, setActiveTab] = useState<'mqtt' | 'postgres' | 'influxdb'>('mqtt');
  const [mqttConfig, setMqttConfig] = useState<MQTTConfigType | null>(null);

  // 保存されたMQTT設定を読み込む
  const loadSavedMQTTConfig = async () => {
    try {
      const response = await fetch('/api/mqtt/config');
      if (response.ok) {
        const savedConfig = await response.json();
        if (savedConfig) {
          console.log('AdminSettings: Loaded saved MQTT config:', savedConfig);
          
          // データベース形式からフロントエンド形式に変換
          const normalizedConfig: MQTTConfigType = {
            broker: savedConfig.broker,
            port: savedConfig.port,
            clientId: savedConfig.client_id || savedConfig.clientId,
            username: savedConfig.username || '',
            password: savedConfig.password || '',
            certificatePath: savedConfig.certificate_path || savedConfig.certificatePath || '',
            privateKeyPath: savedConfig.private_key_path || savedConfig.privateKeyPath || '',
            caPath: savedConfig.ca_path || savedConfig.caPath || '',
            certificateContent: savedConfig.certificate_content || savedConfig.certificateContent || '',
            privateKeyContent: savedConfig.private_key_content || savedConfig.privateKeyContent || '',
            caContent: savedConfig.ca_content || savedConfig.caContent || ''
          };
          
          setMqttConfig(normalizedConfig);
          console.log('AdminSettings: Normalized config for MQTTConfig component:', normalizedConfig);
        }
      }
    } catch (error) {
      console.error('AdminSettings: Error loading saved MQTT config:', error);
    }
  };

  // コンポーネントマウント時に保存された設定を読み込む
  React.useEffect(() => {
    loadSavedMQTTConfig();
  }, []);

  const handleMQTTConfigUpdate = (config: MQTTConfigType) => {
    console.log('AdminSettings: Received config update from MQTTConfig:', config);
    setMqttConfig(config);
    // 親コンポーネントにも設定を通知
    if (onConfigUpdate) {
      console.log('AdminSettings: Notifying parent component of config update');
      onConfigUpdate(config);
    }
  };

  // Thingsboard 設定は廃止済み

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg w-11/12 h-5/6 max-w-6xl flex flex-col">
        {/* Header */}
        <div className="bg-gray-800 p-4 border-b border-gray-700 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Shield className="text-yellow-400 mr-3" size={28} />
              <h1 className="text-xl font-bold text-white">管理者設定</h1>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  // システム状態を再チェックしてからメインアプリに戻る
                  if (onSystemStatusCheck) {
                    onSystemStatusCheck();
                  }
                  onClose();
                }}
                className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                メインアプリに戻る
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('mqtt')}
            className={`flex-1 flex items-center justify-center py-3 ${
              activeTab === 'mqtt'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Wifi size={16} className="mr-2" />
            MQTT設定
          </button>
          <button
            onClick={() => setActiveTab('postgres')}
            className={`flex-1 flex items-center justify-center py-3 ${
              activeTab === 'postgres'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Database size={16} className="mr-2" />
            データベース設定
          </button>
          
          <button
            onClick={() => setActiveTab('influxdb')}
            className={`flex-1 flex items-center justify-center py-3 ${
              activeTab === 'influxdb'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <BarChart3 size={16} className="mr-2" />
            InfluxDB設定
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'mqtt' ? (
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-medium text-white mb-2">MQTT設定</h2>
                <p className="text-gray-400 text-sm">
                  MQTTブローカーとの接続設定を行います。通常のユーザーはこの設定を変更する必要はありません。
                </p>
              </div>
              <MQTTConfig
                config={mqttConfig}
                isConnected={isConnected}
                connectionError={connectionError}
                onConfigUpdate={handleMQTTConfigUpdate}
              />
            </div>
          ) : activeTab === 'postgres' ? (
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-medium text-white mb-2">データベース設定</h2>
                <p className="text-gray-400 text-sm">
                  PostgreSQLデータベースとの接続設定を行います。通常のユーザーはこの設定を変更する必要はありません。
                </p>
              </div>
              <PostgresConfig />
            </div>
          ) : (
            <div>
              <div className="mb-4">
                <h2 className="text-lg font-medium text-white mb-2">InfluxDB設定</h2>
                <p className="text-gray-400 text-sm">
                  InfluxDBとの接続設定を行います。MQTT受信データの時系列データ蓄積を行います。
                </p>
              </div>
              <InfluxDBConfig />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
