import { useState, useEffect, useCallback } from 'react';
import { Asset, AlertRule, Factory, ProductionLine } from '../types';

interface UseDataSyncReturn {
  saveAlertRule: (rule: AlertRule) => Promise<boolean>;
  loadAlertRules: (assetId: string) => Promise<AlertRule[]>;
  saveAsset: (asset: Asset) => Promise<boolean>;
  loadFactories: () => Promise<Factory[]>;
  saveFactory: (factory: Factory) => Promise<boolean>;
  deleteFactory: (factoryId: string) => Promise<boolean>;
  saveProductionLine: (line: ProductionLine) => Promise<boolean>;
  deleteProductionLine: (lineId: string) => Promise<boolean>;
  saveAssetToDB: (asset: Asset) => Promise<boolean>;
  deleteAsset: (assetId: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

export const useDataSync = (): UseDataSyncReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiCall = useCallback(async <T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveAlertRule = useCallback(async (rule: AlertRule): Promise<boolean> => {
    try {
      await apiCall('alert-rules', {
        method: 'POST',
        body: JSON.stringify(rule),
      });
      return true;
    } catch (error) {
      console.error('Error saving alert rule:', error);
      return false;
    }
  }, [apiCall]);

  const loadAlertRules = useCallback(async (assetId: string): Promise<AlertRule[]> => {
    try {
      const rules = await apiCall<AlertRule[]>(`alert-rules?assetId=${assetId}`);
      return rules || [];
    } catch (error) {
      console.error('Error loading alert rules:', error);
      return [];
    }
  }, [apiCall]);

  const saveAsset = useCallback(async (asset: Asset): Promise<boolean> => {
    try {
      await apiCall('assets', {
        method: 'POST',
        body: JSON.stringify(asset),
      });
      return true;
    } catch (error) {
      console.error('Error saving asset:', error);
      return false;
    }
  }, [apiCall]);

  const loadFactories = useCallback(async (): Promise<Factory[]> => {
    try {
      // データベースから取得したデータの型定義
      interface DBFactory {
        id: string;
        name: string;
        created_at: string;
        updated_at: string;
      }

      interface DBProductionLine {
        id: string;
        name: string;
        factory_id: string;
        created_at: string;
        updated_at: string;
      }

      interface DBAsset {
        id: string;
        name: string;
        type: string;
        lineId: string;
        status: string;
        dataSourceType: string;
        mqttTopic: string | null;
        tags?: { label: string; key: string; unit?: string; note?: string }[] | null;
        // Thingsboard フィールドは廃止
        isAlertActive: boolean;
        activeAlertRule: string | null;
        alertTriggeredAt: string | null;
        alertRules: any[];
        createdAt: string;
        updatedAt: string;
      }

      const factories = await apiCall<DBFactory[]>('factories');
      const lines = await apiCall<DBProductionLine[]>('production-lines');
      const assets = await apiCall<DBAsset[]>('assets');

      // データベースの形式をフロントエンドの形式に変換
      const factoryMap = new Map<string, Factory>();
      
      // 工場を初期化
      factories.forEach(factory => {
        factoryMap.set(factory.id, {
          id: factory.id,
          name: factory.name,
          lines: []
        });
      });

      // 生産ラインを工場に追加
      lines.forEach(line => {
        const factory = factoryMap.get(line.factory_id);
        if (factory) {
          factory.lines.push({
            id: line.id,
            name: line.name,
            factoryId: line.factory_id,
            assets: []
          });
        }
      });

      // アセットを生産ラインに追加
      assets.forEach(asset => {
        const line = lines.find(l => l.id === asset.lineId);
        if (line) {
          const factory = factoryMap.get(line.factory_id);
          if (factory) {
            const productionLine = factory.lines.find(l => l.id === line.id);
            if (productionLine) {
              // アラートルールを適切に変換
              const alertRules = Array.isArray(asset.alertRules) 
                ? asset.alertRules.filter(rule => rule !== null).map((rule: any) => ({
                    id: rule.id,
                    name: rule.name,
                    assetId: rule.assetId || asset.id,
                    isActive: rule.isActive,
                    conditions: rule.conditions || [],
                    actions: rule.actions || []
                  }))
                : [];

              productionLine.assets.push({
                id: asset.id,
                name: asset.name,
                type: asset.type as any,
                lineId: asset.lineId,
                status: asset.status as any,
                dataSourceType: 'mqtt',
                mqttTopic: asset.mqttTopic || '',
                tags: asset.tags || undefined,
                alertRules,
                isAlertActive: asset.isAlertActive,
                activeAlertRule: asset.activeAlertRule || undefined,
                alertTriggeredAt: asset.alertTriggeredAt ? new Date(asset.alertTriggeredAt) : undefined
              });
            }
          }
        }
      });

      return Array.from(factoryMap.values());
    } catch (error) {
      console.error('Error loading factories:', error);
      return [];
    }
  }, [apiCall]);

  const saveFactory = useCallback(async (factory: Factory): Promise<boolean> => {
    try {
      await apiCall('factories', {
        method: 'POST',
        body: JSON.stringify({
          id: factory.id,
          name: factory.name
        }),
      });
      return true;
    } catch (error) {
      console.error('Error saving factory:', error);
      return false;
    }
  }, [apiCall]);

  const deleteFactory = useCallback(async (factoryId: string): Promise<boolean> => {
    try {
      await apiCall(`factories/${factoryId}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      console.error('Error deleting factory:', error);
      return false;
    }
  }, [apiCall]);

  const saveProductionLine = useCallback(async (line: ProductionLine): Promise<boolean> => {
    try {
      await apiCall('production-lines', {
        method: 'POST',
        body: JSON.stringify({
          id: line.id,
          name: line.name,
          factoryId: line.factoryId
        }),
      });
      return true;
    } catch (error) {
      console.error('Error saving production line:', error);
      return false;
    }
  }, [apiCall]);

  const deleteProductionLine = useCallback(async (lineId: string): Promise<boolean> => {
    try {
      await apiCall(`production-lines/${lineId}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      console.error('Error deleting production line:', error);
      return false;
    }
  }, [apiCall]);

  const saveAssetToDB = useCallback(async (asset: Asset): Promise<boolean> => {
    try {
      const response = await apiCall('assets', {
        method: 'POST',
        body: JSON.stringify({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          lineId: asset.lineId,
          status: asset.status,
          dataSourceType: 'mqtt',
          mqttTopic: asset.mqttTopic || '',
          tags: asset.tags || null,
          isAlertActive: asset.isAlertActive,
          activeAlertRule: asset.activeAlertRule,
          alertTriggeredAt: asset.alertTriggeredAt
        }),
      });
      return true;
    } catch (error: any) {
      console.error('Error saving asset:', error);
      
      // MQTTトピックの重複エラーの場合
      if (error.message && error.message.includes('MQTTトピックの重複')) {
        throw new Error('このトピックは既に他のアセットで使用されています');
      }
      
      return false;
    }
  }, [apiCall]);

  const deleteAsset = useCallback(async (assetId: string): Promise<boolean> => {
    try {
      await apiCall(`assets/${assetId}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      console.error('Error deleting asset:', error);
      return false;
    }
  }, [apiCall]);

  return {
    saveAlertRule,
    loadAlertRules,
    saveAsset,
    loadFactories,
    saveFactory,
    deleteFactory,
    saveProductionLine,
    deleteProductionLine,
    saveAssetToDB,
    deleteAsset,
    isLoading,
    error,
  };
};
