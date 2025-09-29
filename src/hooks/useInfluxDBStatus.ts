import { useState, useEffect } from 'react';

interface InfluxDBStatus {
  isConnected: boolean;
  error: string | null;
}

export const useInfluxDBStatus = () => {
  const [status, setStatus] = useState<InfluxDBStatus>({
    isConnected: false,
    error: null
  });

  const checkInfluxDBConnection = async () => {
    try {
      // まず保存された設定を取得
      const configResponse = await fetch('/api/influxdb/config', { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (!configResponse.ok) {
        setStatus({
          isConnected: false,
          error: 'InfluxDB configuration not available'
        });
        return;
      }
      
      const config = await configResponse.json();
      
      if (!config || !config.url) {
        setStatus({
          isConnected: false,
          error: 'InfluxDB configuration not found'
        });
        return;
      }
      
      // 保存された設定を使用して接続テストを実行
      const legacyPayload = {
        url: config.url,
        token: config.token,
        org: (config as any).org || 'glico',
        bucket: (config as any).bucket || (config as any).database
      };
      const testResponse = await fetch('/api/influxdb/test', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(legacyPayload),
        signal: AbortSignal.timeout(5000)
      });
      
      const result = await testResponse.json();
      
      setStatus({
        isConnected: result.success === true,
        error: result.success ? null : (result.error || 'InfluxDB connection failed')
      });
    } catch (error) {
      setStatus({
        isConnected: false,
        error: `InfluxDB connection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  useEffect(() => {
    // 初回チェック
    checkInfluxDBConnection();

    // 定期的にチェック（30秒ごと）
    const interval = setInterval(checkInfluxDBConnection, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    ...status,
    checkInfluxDBConnection
  };
};
