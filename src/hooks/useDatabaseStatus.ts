import { useState, useEffect } from 'react';

interface DatabaseStatus {
  isConnected: boolean;
  error: string | null;
}

export const useDatabaseStatus = () => {
  const [status, setStatus] = useState<DatabaseStatus>({
    isConnected: false,
    error: null
  });

  const checkDatabaseConnection = async () => {
    try {
      // PostgreSQL設定を取得して、データベース接続状態を確認
      const response = await fetch('/api/postgres/config');
      
      if (response.ok) {
        const data = await response.json();
        
        // 設定が存在し、is_activeがtrueの場合、データベースは接続されているとみなす
        const isConnected = data && data.is_active === true;
        setStatus({
          isConnected: isConnected,
          error: isConnected ? null : 'No active database configuration'
        });
      } else {
        const errorText = await response.text();
        setStatus({
          isConnected: false,
          error: `Failed to check database status: ${response.status} ${errorText}`
        });
      }
    } catch (error) {
      setStatus({
        isConnected: false,
        error: `Database connection error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  useEffect(() => {
    // 初回チェック
    checkDatabaseConnection();

    // 定期的にチェック（30秒ごと）
    const interval = setInterval(checkDatabaseConnection, 30000);

    return () => clearInterval(interval);
  }, []);

  return status;
};
