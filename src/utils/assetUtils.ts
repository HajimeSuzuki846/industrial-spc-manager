import { Factory, Asset } from '../types';
import { mockFactories } from '../data/mockData';

export const findAssetByTopic = (topic: string): Asset | null => {
  for (const factory of mockFactories) {
    for (const line of factory.lines) {
      for (const asset of line.assets) {
        if (asset.mqttTopic === topic) {
          return asset;
        }
      }
    }
  }
  return null;
};

export const extractValueFromMessage = (message: any): number | null => {
  if (typeof message === 'number') {
    return message;
  }
  
  if (typeof message === 'string') {
    const num = parseFloat(message);
    return isNaN(num) ? null : num;
  }
  
  if (typeof message === 'object' && message !== null) {
    if ('value' in message && typeof message.value === 'number') {
      return message.value;
    }
    
    // 最初の数値プロパティを探す
    for (const key in message) {
      if (typeof message[key] === 'number') {
        return message[key];
      }
    }
  }
  
  return null;
};

// UUIDを生成する関数
export const generateAssetId = (): string => {
  // 簡易的なUUID v4生成（実際のプロジェクトではuuidライブラリの使用を推奨）
  const generateRandomHex = (length: number): string => {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  };

  const part1 = generateRandomHex(8);
  const part2 = generateRandomHex(4);
  const part3 = generateRandomHex(4);
  const part4 = generateRandomHex(4);
  const part5 = generateRandomHex(12);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
};

// アセットIDが有効なUUID形式かチェックする関数
export const isValidAssetId = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};
