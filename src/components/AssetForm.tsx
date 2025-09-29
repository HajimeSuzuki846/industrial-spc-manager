import React, { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, Wifi } from 'lucide-react';
import { Asset, AssetType } from '../types';
import { generateAssetId } from '../utils/assetUtils';

interface AssetFormProps {
  asset: Asset;
  onSave: (updatedAsset: Asset) => void;
  onCancel: () => void;
  isOpen: boolean;
}

const assetTypes: AssetType[] = [
  'sensor', 'actuator', 'controller', 'motor', 'pump', 
  'valve', 'conveyor', 'robot', 'camera', 'other'
];

export const AssetForm: React.FC<AssetFormProps> = ({
  asset,
  onSave,
  onCancel,
  isOpen
}) => {
  const [formData, setFormData] = useState<Asset>(asset);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isCheckingTopic, setIsCheckingTopic] = useState(false);
  const [topicCheckTimeout, setTopicCheckTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // アセットデータにdataSourceTypeフィールドが存在しない場合はデフォルト値を設定
    // 新しいアセットの場合（IDが一時的な場合）はUUIDを生成
    const assetWithDefaults = {
      ...asset,
      id: asset.id.startsWith('temp_') ? generateAssetId() : asset.id,
      dataSourceType: asset.dataSourceType || 'mqtt',
      mqttTopic: asset.mqttTopic || ''
    };
    setFormData(assetWithDefaults);
    setErrors({});
    
    // クリーンアップ関数
    return () => {
      if (topicCheckTimeout) {
        clearTimeout(topicCheckTimeout);
      }
    };
  }, [asset]);

  // MQTTトピックの重複チェック
  const checkTopicDuplication = async (topic: string) => {
    if (!topic.trim() || formData.dataSourceType !== 'mqtt') {
      return;
    }

    try {
      setIsCheckingTopic(true);
      const response = await fetch('/api/assets/check-topic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topic: topic.trim(),
          excludeAssetId: formData.id
        }),
      });

      const result = await response.json();
      
      if (result.isDuplicate) {
        setErrors(prev => ({
          ...prev,
          mqttTopic: result.message
        }));
      } else {
        // 重複エラーをクリア
        setErrors(prev => {
          const newErrors = { ...prev };
          if (newErrors.mqttTopic && newErrors.mqttTopic.includes('既に他のアセットで使用されています')) {
            delete newErrors.mqttTopic;
          }
          return newErrors;
        });
      }
    } catch (error) {
      console.error('Error checking topic duplication:', error);
    } finally {
      setIsCheckingTopic(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = '名前は必須です';
    }

    if (formData.dataSourceType === 'mqtt') {
      if (!formData.mqttTopic?.trim()) {
        newErrors.mqttTopic = 'MQTTトピックは必須です';
      } else if (!/^[a-zA-Z0-9\/_-]+$/.test(formData.mqttTopic)) {
        newErrors.mqttTopic = 'MQTTトピックは英数字、スラッシュ、アンダースコア、ハイフンのみ使用可能です';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  const handleInputChange = (field: keyof Asset, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // MQTTトピックの変更時に重複チェックを実行
    if (field === 'mqttTopic' && formData.dataSourceType === 'mqtt') {
      // 既存のタイムアウトをクリア
      if (topicCheckTimeout) {
        clearTimeout(topicCheckTimeout);
      }
      
      // 500ms後に重複チェックを実行（デバウンス）
      const timeout = setTimeout(() => {
        checkTopicDuplication(value);
      }, 500);
      
      setTopicCheckTimeout(timeout);
    }
    
    // エラーをクリア（重複エラー以外）
    if (errors[field] && !errors[field].includes('既に他のアセットで使用されています')) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleDataSourceChange = (dataSourceType: 'mqtt') => {
    setFormData(prev => ({
      ...prev,
      dataSourceType,
      // データソースを変更したら、関連フィールドをクリア
      mqttTopic: dataSourceType === 'mqtt' ? prev.mqttTopic : ''
    }));
    // エラーをクリア
    setErrors(prev => ({
      ...prev,
      mqttTopic: ''
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">アセット編集</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white p-1"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 名前 */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              名前 *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-white ${
                errors.name ? 'border-red-500' : 'border-gray-600'
              } focus:outline-none focus:border-blue-500`}
              placeholder="アセット名を入力"
            />
            {errors.name && (
              <p className="text-red-400 text-sm mt-1 flex items-center">
                <AlertTriangle size={12} className="mr-1" />
                {errors.name}
              </p>
            )}
          </div>

          {/* タイプ */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              タイプ *
            </label>
            <select
              value={formData.type}
              onChange={(e) => handleInputChange('type', e.target.value as AssetType)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-blue-500"
            >
              {assetTypes.map(type => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* データソースタイプ */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              データソースタイプ *
            </label>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => handleDataSourceChange('mqtt')}
                className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                  formData.dataSourceType === 'mqtt'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Wifi size={16} className="mr-2" /> MQTT
              </button>
            </div>
          </div>

          {/* MQTTトピック (MQTTの場合のみ表示) */}
          {formData.dataSourceType === 'mqtt' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                MQTTトピック *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.mqttTopic}
                  onChange={(e) => handleInputChange('mqttTopic', e.target.value)}
                  className={`w-full px-3 py-2 bg-gray-700 border rounded-md text-white ${
                    errors.mqttTopic ? 'border-red-500' : 'border-gray-600'
                  } focus:outline-none focus:border-blue-500`}
                  placeholder="factory/line/asset"
                />
                {isCheckingTopic && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  </div>
                )}
              </div>
              {errors.mqttTopic && (
                <p className="text-red-400 text-sm mt-1 flex items-center">
                  <AlertTriangle size={12} className="mr-1" />
                  {errors.mqttTopic}
                </p>
              )}
              {formData.mqttTopic && !errors.mqttTopic && !isCheckingTopic && (
                <p className="text-green-400 text-sm mt-1 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  トピックは利用可能です
                </p>
              )}
              {errors.mqttTopic && errors.mqttTopic.includes('既に他のアセットで使用されています') && (
                <p className="text-red-400 text-sm mt-1 flex items-center">
                  <AlertTriangle size={12} className="mr-1" />
                  重複するトピックのため保存できません
                </p>
              )}
            </div>
          )}

          {/* Thingsboard UI は削除 */}

          {/* ステータス */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              ステータス
            </label>
            <select
              value={formData.status}
              onChange={(e) => handleInputChange('status', e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-blue-500"
            >
              <option value="online">オンライン</option>
              <option value="offline">オフライン</option>
              <option value="warning">警告</option>
              <option value="error">エラー</option>
            </select>
          </div>

          {/* ボタン */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={
                Object.keys(errors).length > 0 || 
                isCheckingTopic ||
                (formData.dataSourceType === 'mqtt' && !formData.mqttTopic?.trim()) ||
                !formData.name.trim()
              }
              className={`flex-1 px-4 py-2 rounded-md transition-colors flex items-center justify-center ${
                Object.keys(errors).length > 0 || 
                isCheckingTopic ||
                (formData.dataSourceType === 'mqtt' && !formData.mqttTopic?.trim()) ||
                !formData.name.trim()
                  ? 'bg-gray-500 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Save size={16} className="mr-2" />
              {isCheckingTopic ? 'チェック中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
