import React, { useState, useEffect } from 'react';
import { Wifi, Database, WifiOff, Database as DatabaseOff, Activity, Activity as ActivityOff } from 'lucide-react';

interface ConnectionStatusProps {
  mqttConnected: boolean;
  mqttError: string | null;
  databaseConnected: boolean;
  databaseError: string | null;
  influxdbConnected?: boolean;
  influxdbError?: string | null;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  mqttConnected,
  mqttError,
  databaseConnected,
  databaseError,
  influxdbConnected = false,
  influxdbError = null
}) => {
  const getStatusColor = (isConnected: boolean, hasError: boolean, isWaiting?: boolean) => {
    if (hasError) return 'text-red-400';
    if (isConnected) return 'text-green-400';
    if (isWaiting) return 'text-yellow-400';
    return 'text-gray-400';
  };

  const getDatabaseStatusColor = () => {
    return getStatusColor(databaseConnected, !!databaseError);
  };

  // MQTTがデータベース接続を待機中かどうかを判定
  const isMQTTWaiting = !databaseConnected && !mqttConnected && mqttError?.includes('データベース接続完了後');

  const getStatusIcon = (isConnected: boolean, hasError: boolean, type: 'mqtt' | 'database' | 'influxdb') => {
    if (type === 'mqtt') {
      return isConnected ? (
        <Wifi size={12} className={getStatusColor(isConnected, hasError)} />
      ) : (
        <WifiOff size={12} className={getStatusColor(isConnected, hasError)} />
      );
    } else if (type === 'database') {
      return isConnected ? (
        <Database size={12} className={getStatusColor(isConnected, hasError)} />
      ) : (
        <DatabaseOff size={12} className={getStatusColor(isConnected, hasError)} />
      );
    } else if (type === 'influxdb') {
      return isConnected ? (
        <Activity size={12} className={getStatusColor(isConnected, hasError)} />
      ) : (
        <ActivityOff size={12} className={getStatusColor(isConnected, hasError)} />
      );
    }
  };

  return (
    <div className="fixed bottom-4 right-4 flex items-center space-x-2 bg-gray-800/80 backdrop-blur-sm px-3 py-2 rounded-lg border border-gray-700/50 shadow-lg z-50" title={mqttError || undefined}>
      <div className="flex items-center space-x-1">
        {getStatusIcon(mqttConnected, !!mqttError, 'mqtt')}
        <span className={`text-xs ${getStatusColor(mqttConnected, !!mqttError, isMQTTWaiting)}`}>
          MQTT
        </span>
      </div>
      <div className="w-px h-3 bg-gray-600"></div>
      <div className="flex items-center space-x-1">
        {getStatusIcon(databaseConnected, !!databaseError, 'database')}
        <span className={`text-xs ${getDatabaseStatusColor()}`}>
          DB
        </span>
      </div>
      <div className="w-px h-3 bg-gray-600"></div>
      <div className="flex items-center space-x-1">
        {getStatusIcon(influxdbConnected, !!influxdbError, 'influxdb')}
        <span className={`text-xs ${getStatusColor(influxdbConnected, !!influxdbError)}`}>
          Influx
        </span>
      </div>
    </div>
  );
};
