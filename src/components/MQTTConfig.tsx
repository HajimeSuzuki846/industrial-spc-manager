import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Settings, AlertCircle, Power, FileText, Folder } from 'lucide-react';
import { MQTTConfig as MQTTConfigType } from '../types';

interface CertificateFile {
  name: string;
  path: string;
}

interface CertificateFiles {
  certificates: CertificateFile[];
  privateKeys: CertificateFile[];
  caFiles: CertificateFile[];
}

interface MQTTConfigProps {
  config: MQTTConfigType | null;
  isConnected: boolean;
  connectionError?: string | null;
  onConfigUpdate: (config: MQTTConfigType) => void;
  onDisconnect?: () => void;
}

export const MQTTConfig: React.FC<MQTTConfigProps> = ({
  config,
  isConnected,
  connectionError,
  onConfigUpdate,
  onDisconnect
}) => {
  const [isEditing, setIsEditing] = useState(!config);
  const [certificateFiles, setCertificateFiles] = useState<CertificateFiles>({
    certificates: [],
    privateKeys: [],
    caFiles: []
  });
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  
  // デフォルト設定でCA証明書を空にする
  const [formData, setFormData] = useState<MQTTConfigType>(
    config || {
      broker: 'a1ve8krensecyj-ats.iot.us-west-2.amazonaws.com',
      port: 8883,
      clientId: `asser-manager-client-${Math.random().toString(36).slice(2, 10)}`,
      username: '',
      password: '',
      certificatePath: 'certificates/c164c30eca2f6b14a4ed63c8a0f92f8e24064baa911a12dc6772e0374848b14c-certificate.pem.crt',
      privateKeyPath: 'certificates/c164c30eca2f6b14a4ed63c8a0f92f8e24064baa911a12dc6772e0374848b14c-private.pem.key',
      caPath: '', // CA証明書を空にする
      certificateContent: '',
      privateKeyContent: '',
      caContent: ''
    }
  );

  // 証明書ファイル一覧を取得
  const loadCertificateFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch('/api/certificates');
      if (response.ok) {
        const files = await response.json();
        setCertificateFiles(files);
        
        // デフォルトファイルを自動選択
        if (!config) {
          const defaultConfig = { ...formData };
          
          // 証明書ファイルを自動選択
          if (files.certificates.length > 0) {
            const certFile = files.certificates[0];
            defaultConfig.certificatePath = certFile.path;
            // ファイル内容も読み込む
            await loadCertificateContent(certFile.name, 'certificateContent');
          }
          
          // 秘密鍵ファイルを自動選択
          if (files.privateKeys.length > 0) {
            const keyFile = files.privateKeys[0];
            defaultConfig.privateKeyPath = keyFile.path;
            // ファイル内容も読み込む
            await loadCertificateContent(keyFile.name, 'privateKeyContent');
          }
          
          // CAファイルを自動選択
          if (files.caFiles.length > 0) {
            const caFile = files.caFiles[0];
            defaultConfig.caPath = caFile.path;
            // ファイル内容も読み込む
            await loadCertificateContent(caFile.name, 'caContent');
          }
          
          setFormData(defaultConfig);
        }
      } else {
        console.error('Failed to load certificate files');
      }
    } catch (error) {
      console.error('Error loading certificate files:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // 証明書ファイルの内容を読み込む
  const loadCertificateContent = async (filename: string, contentField: keyof MQTTConfigType) => {
    try {
      const response = await fetch(`/api/certificates/${filename}`);
      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          [contentField]: data.content
        }));
      }
    } catch (error) {
      console.error(`Error loading certificate content for ${filename}:`, error);
    }
  };

  // コンポーネントマウント時にファイル一覧を読み込む
  useEffect(() => {
    loadCertificateFiles();
  }, []);

  // 保存されたMQTT設定を読み込む
  const loadSavedMQTTConfig = async () => {
    try {
      const response = await fetch('/api/mqtt/config');
      if (response.ok) {
        const savedConfig = await response.json();
        if (savedConfig) {
          console.log('MQTTConfig: Loaded saved MQTT config:', savedConfig);
          
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
          
          setFormData(normalizedConfig);
          console.log('MQTTConfig: Normalized config for form:', normalizedConfig);
        }
      }
    } catch (error) {
      console.error('MQTTConfig: Error loading saved MQTT config:', error);
    }
  };

  // コンポーネントマウント時に保存された設定を読み込む
  useEffect(() => {
    loadSavedMQTTConfig();
  }, []);

  // configプロパティが変更されたときにformDataを更新
  useEffect(() => {
    if (config) {
      console.log('MQTTConfig: Config prop updated:', config);
      setFormData(config);
    }
  }, [config]);

  const handleSave = async () => {
    console.log('Original formData:', formData);
    
    try {
      // idフィールドを除外して送信
      const { id, created_at, updated_at, ...configToSave } = formData;
      
      // フィールド名を統一（client_id → clientId）
      const configForSaving = {
        ...configToSave,
        clientId: (configToSave as any).client_id || configToSave.clientId
      };
      
      // client_idフィールドを削除
      delete (configForSaving as any).client_id;
      
      console.log('Config to save (after excluding id, created_at, updated_at and normalizing):', configForSaving);
      
      // バックエンドにMQTT設定を保存
      const response = await fetch('/api/mqtt/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configForSaving),
      });

      if (!response.ok) {
        throw new Error(`Failed to save MQTT config: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('MQTT config saved successfully:', result);
      
      // 保存された設定でMQTT接続を確立
      const savedConfig = result.config;
      console.log('Establishing MQTT connection with saved config:', savedConfig);
      
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
      
      console.log('Normalized config for MQTT connection:', normalizedConfig);
      
      // 親コンポーネントに設定を通知（これによりMQTT接続が確立される）
      console.log('Calling onConfigUpdate with normalized config...');
      onConfigUpdate(normalizedConfig);
      console.log('onConfigUpdate called successfully');
      
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving MQTT config:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`MQTT設定の保存に失敗しました: ${errorMessage}`);
    }
  };

  const handleChange = (field: keyof MQTTConfigType, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleDisconnect = () => {
    if (onDisconnect) {
      onDisconnect();
    }
  };

  const handleFileSelect = (field: 'certificatePath' | 'privateKeyPath' | 'caPath') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.crt,.key,.pem,.pem.crt,.pem.key';
    
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          const fileName = file.name;
          const filePath = `certificates/${fileName}`;
          
          // ファイルパスと内容の両方を保存
          handleChange(field, filePath);
          
          // 証明書の内容を保存
          const contentField = field === 'certificatePath' ? 'certificateContent' :
                              field === 'privateKeyPath' ? 'privateKeyContent' : 'caContent';
          handleChange(contentField as keyof MQTTConfigType, content);
          
          console.log(`Loaded ${field}: ${fileName} (${content.length} characters)`);
        };
        reader.readAsText(file);
      }
    };
    
    input.click();
  };

  const getConnectionStatus = () => {
    if (isConnected) {
      return {
        icon: <Wifi className="text-green-500 mr-2" size={20} />,
        text: <span className="text-green-500">Connected</span>,
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/20'
      };
    } else if (connectionError) {
      return {
        icon: <AlertCircle className="text-red-500 mr-2" size={20} />,
        text: <span className="text-red-500">Connection Failed</span>,
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/20'
      };
    } else {
      return {
        icon: <WifiOff className="text-gray-400 mr-2" size={20} />,
        text: <span className="text-gray-400">Disconnected</span>,
        bgColor: 'bg-gray-500/10',
        borderColor: 'border-gray-500/20'
      };
    }
  };

  const connectionStatus = getConnectionStatus();

  // ファイル選択ドロップダウンを追加
  const renderFileSelect = (field: 'certificatePath' | 'privateKeyPath' | 'caPath', label: string, files: CertificateFile[]) => {
    const contentField = field === 'certificatePath' ? 'certificateContent' :
                        field === 'privateKeyPath' ? 'privateKeyContent' : 'caContent';
    
    return (
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          {label}
        </label>
        <div className="flex items-center space-x-2">
          <select
            value={formData[field]}
            onChange={async (e) => {
              const selectedPath = e.target.value;
              handleChange(field, selectedPath);
              
              // ファイル内容も読み込む
              if (selectedPath) {
                const filename = selectedPath.split('/').pop();
                if (filename) {
                  await loadCertificateContent(filename, contentField as keyof MQTTConfigType);
                }
              }
            }}
            className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a file...</option>
            {files.map((file) => (
              <option key={file.path} value={file.path}>
                {file.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => handleFileSelect(field)}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Folder size={16} />
          </button>
        </div>
        {isLoadingFiles && (
          <p className="text-xs text-gray-400 mt-1">Loading files...</p>
        )}
      </div>
    );
  };

  if (isEditing) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <Settings className="mr-2" size={24} />
            MQTT Configuration
          </h2>
          <div className="flex items-center space-x-2">
            {connectionStatus.icon}
            {connectionStatus.text}
          </div>
        </div>

        {connectionError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-center text-red-400 text-sm">
              <AlertCircle className="mr-2" size={16} />
              {connectionError}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* Broker Configuration */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Broker URL
            </label>
            <input
              type="text"
              value={formData.broker}
              onChange={(e) => handleChange('broker', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="mqtt.example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Port
              </label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => handleChange('port', parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1883"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Client ID
              </label>
              <input
                type="text"
                value={formData.clientId}
                onChange={(e) => handleChange('clientId', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="my-client"
              />
            </div>
          </div>

          {/* Authentication */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username (Optional)
              </label>
              <input
                type="text"
                value={formData.username || ''}
                onChange={(e) => handleChange('username', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password (Optional)
              </label>
              <input
                type="password"
                value={formData.password || ''}
                onChange={(e) => handleChange('password', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="password"
              />
            </div>
          </div>

          {/* Certificate Configuration */}
          <div className="border-t border-gray-700 pt-4">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center">
              <FileText className="mr-2" size={20} />
              Certificate Authentication
            </h3>
            
            <div className="space-y-4">
              {/* 証明書ファイル選択を更新 */}
              {renderFileSelect('certificatePath', 'Certificate File', certificateFiles.certificates)}
              {renderFileSelect('privateKeyPath', 'Private Key File', certificateFiles.privateKeys)}
              {renderFileSelect('caPath', 'CA Certificate File', certificateFiles.caFiles)}
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={() => setIsEditing(false)}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Save Configuration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center">
          <Settings className="mr-2" size={24} />
          MQTT Configuration
        </h2>
        <div className="flex items-center space-x-4">
          <div className={`flex items-center px-3 py-1 rounded-lg ${connectionStatus.bgColor} ${connectionStatus.borderColor} border`}>
            {connectionStatus.icon}
            {connectionStatus.text}
          </div>
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1 text-gray-300 hover:text-white transition-colors"
          >
            Edit
          </button>
          {isConnected && (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {connectionError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center text-red-400 text-sm">
            <AlertCircle className="mr-2" size={16} />
            {connectionError}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-400">Broker:</span>
          <div className="text-white font-mono">{config?.broker}</div>
        </div>
        <div>
          <span className="text-gray-400">Port:</span>
          <div className="text-white">{config?.port}</div>
        </div>
        <div>
          <span className="text-gray-400">Client ID:</span>
          <div className="text-white font-mono">{config?.clientId}</div>
        </div>
        <div>
          <span className="text-gray-400">Status:</span>
          <div className="text-white">{isConnected ? 'Connected' : 'Disconnected'}</div>
        </div>
      </div>

      {config?.certificatePath && (
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="text-blue-400 text-sm">
            <strong>Certificate Authentication:</strong>
            <div className="mt-1 font-mono text-xs">
              Cert: {config.certificatePath}
            </div>
            <div className="font-mono text-xs">
              Key: {config.privateKeyPath}
            </div>
            {config.caPath && (
              <div className="font-mono text-xs">
                CA: {config.caPath}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};