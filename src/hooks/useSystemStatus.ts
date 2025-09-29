import { useState, useEffect, useCallback } from 'react';

interface SystemStatus {
  backend: boolean;
  database: boolean;
  mqtt: boolean;
  influxdb: boolean;
  isLoading: boolean;
  errors: {
    backend?: string;
    database?: string;
    mqtt?: string;
    influxdb?: string;
  };
}

export const useSystemStatus = () => {
  const [status, setStatus] = useState<SystemStatus>({
    backend: false,
    database: false,
    mqtt: false,
    influxdb: false,
    isLoading: true,
    errors: {}
  });
  
  // 初回読み込み完了フラグ
  const [isInitialized, setIsInitialized] = useState(false);

  const checkSystemStatus = useCallback(async (isPeriodicCheck: boolean = false) => {
    console.log('useSystemStatus: checkSystemStatusが実行されました', { isPeriodicCheck });
    
    try {
      // 初回チェック時のみisLoadingをtrueにする
      if (!isPeriodicCheck) {
        setStatus(prev => ({ ...prev, isLoading: true }));
      }

      const newStatus: SystemStatus = {
        backend: false,
        database: false,
        mqtt: false,
        influxdb: false,
        isLoading: false,
        errors: {}
      };

      // バックエンド接続チェック
      try {
        const backendResponse = await fetch('/api/health', { 
          method: 'GET',
          signal: AbortSignal.timeout(5000) // 5秒タイムアウト
        });
        newStatus.backend = backendResponse.ok;
        if (!backendResponse.ok) {
          newStatus.errors.backend = `Backend error: ${backendResponse.status}`;
        }
      } catch (error) {
        newStatus.errors.backend = `Backend connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }

      // データベース接続チェック
      try {
        const dbResponse = await fetch('/api/database/status', { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        const dbResult = await dbResponse.json();
        newStatus.database = dbResult.connected === true;
        if (!dbResult.connected) {
          newStatus.errors.database = dbResult.error || 'Database connection failed';
        }
      } catch (error) {
        newStatus.errors.database = `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }

      // MQTT接続チェック - 保存された設定を使用
      try {
        const mqttConfigResponse = await fetch('/api/mqtt/config', { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        
        if (mqttConfigResponse.ok) {
          const mqttConfig = await mqttConfigResponse.json();
          if (mqttConfig) {
            // 保存された設定がある場合は接続テストを実行
            const mqttTestResponse = await fetch('/api/mqtt/test', { 
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(mqttConfig),
              signal: AbortSignal.timeout(5000)
            });
            const mqttResult = await mqttTestResponse.json();
            newStatus.mqtt = mqttResult.success === true;
            if (!mqttResult.success) {
              newStatus.errors.mqtt = mqttResult.error || 'MQTT connection failed';
            }
          } else {
            newStatus.errors.mqtt = 'MQTT configuration not found';
          }
        } else {
          newStatus.errors.mqtt = 'MQTT configuration not available';
        }
      } catch (error) {
        newStatus.errors.mqtt = `MQTT connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }

      // InfluxDB接続チェック - 保存された設定を使用
      try {
        const influxConfigResponse = await fetch('/api/influxdb/config', { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        
        if (influxConfigResponse.ok) {
          const influxConfig = await influxConfigResponse.json();
          if (influxConfig && influxConfig.url) {
            // 保存された設定がある場合は接続テストを実行
            const influxLegacyPayload = {
              url: influxConfig.url,
              token: influxConfig.token,
              org: influxConfig.org || 'glico',
              bucket: influxConfig.bucket || influxConfig.database
            };
            const influxTestResponse = await fetch('/api/influxdb/test', { 
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(influxLegacyPayload),
              signal: AbortSignal.timeout(5000)
            });
            const influxResult = await influxTestResponse.json();
            newStatus.influxdb = influxResult.success === true;
            if (!influxResult.success) {
              newStatus.errors.influxdb = influxResult.error || 'InfluxDB connection failed';
            }
          } else {
            newStatus.errors.influxdb = 'InfluxDB configuration not found';
          }
        } else {
          newStatus.errors.influxdb = 'InfluxDB configuration not available';
        }
      } catch (error) {
        newStatus.errors.influxdb = `InfluxDB connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }

      console.log('useSystemStatus: システム状態チェック結果:', newStatus);
      
      // 初回読み込み時またはエラーがある場合のみ画面を更新
      if (!isInitialized || Object.keys(newStatus.errors).length > 0) {
        setStatus(newStatus);
        if (!isInitialized) {
          setIsInitialized(true);
        }
      } else if (isPeriodicCheck) {
        // 定期的なチェックでは、エラーがない場合は何も更新しない
        console.log('useSystemStatus: 定期的なチェック完了 - エラーなし、画面更新なし');
      } else {
        // 初回チェックでエラーがない場合
        setStatus(newStatus);
        setIsInitialized(true);
      }
    } catch (error) {
      console.error('SystemStatus hook error:', error);
      const errorStatus = {
        backend: false,
        database: false,
        mqtt: false,
        influxdb: false,
        isLoading: false,
        errors: {
          backend: 'System status check failed'
        }
      };
      
      setStatus(errorStatus);
      if (!isInitialized) {
        setIsInitialized(true);
      }
    }
  }, [isInitialized]);

  useEffect(() => {
    try {
      // 初回チェック
      checkSystemStatus();

      // 定期的にチェック（10分ごと）- エラーがない場合は画面を更新しない
      const interval = setInterval(() => checkSystemStatus(true), 600000);

      return () => clearInterval(interval);
    } catch (error) {
      console.error('useSystemStatus useEffect error:', error);
    }
  }, [checkSystemStatus]);

  // 外部から強制的にチェックを実行できるようにする
  const forceCheck = () => {
    checkSystemStatus();
  };

  return {
    ...status,
    checkSystemStatus,
    forceCheck,
    // 外部から強制的にチェックを実行できるようにする
    refreshStatus: () => {
      checkSystemStatus();
    }
  };
};
