import { useState, useEffect, useCallback, useRef } from 'react';
import { MQTTConfig, Asset, Factory } from '../types';
import { alertEvaluator } from '../utils/alertEvaluator';

interface UseMQTTProps {
  config: MQTTConfig | null;
  factories: Factory[]; // ファクトリーの配列
  onAssetUpdate?: (asset: Asset) => void;
  databaseConnected?: boolean; // データベース接続状態を追加
}

// メッセージの更新をデバウンスするためのユーティリティ
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// メッセージが実際に変更されたかどうかをチェックする関数
const isMessageChanged = (oldMessage: any, newMessage: any): boolean => {
  if (!oldMessage && newMessage) return true;
  if (oldMessage && !newMessage) return true;
  if (!oldMessage && !newMessage) return false;
  
  // 値の比較
  if (oldMessage.value !== newMessage.value) return true;
  
  // タイムスタンプの比較（1秒以内の変更は無視）
  const oldTime = new Date(oldMessage.timestamp).getTime();
  const newTime = new Date(newMessage.timestamp).getTime();
  return Math.abs(newTime - oldTime) > 1000;
};

export const useMQTT = ({ config, factories, onAssetUpdate, databaseConnected = false }: UseMQTTProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Record<string, any>>({});
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  const subscribeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  const configRef = useRef<MQTTConfig | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000; // 3秒
  const uniqueClientIdRef = useRef<string | null>(null); // 一意のクライアントIDを保存
  
  // 接続時間を追跡するための状態管理
  const connectionStartTimeRef = useRef<Date | null>(null);
  
  // 重複メッセージを防ぐための状態管理
  const lastProcessedMessageRef = useRef<{
    type: string;
    status?: string;
    connectionId?: string;
    topic?: string;
    timestamp?: string;
  } | null>(null);
  
  // 最新のfactoriesを参照するためのref
  const factoriesRef = useRef(factories);
  
  // refを最新の値で更新
  factoriesRef.current = factories;

  // subscribeとevaluateAlertRulesのrefを作成
  const subscribeRef = useRef<((topic: string) => void) | null>(null);
  const evaluateAlertRulesRef = useRef<((topic: string, message: any) => Promise<void>) | null>(null);

  // メッセージ更新をデバウンスするためのref
  const debouncedSetMessagesRef = useRef<((updater: (prev: Record<string, any>) => Record<string, any>) => void) | null>(null);

  // メッセージ更新関数
  const updateMessages = useCallback((topic: string, message: any, timestamp: string) => {
    try {
      // メッセージをパース
      const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
      
      // 現在のメッセージを取得
      const currentMessage = messages[topic];
      
      // メッセージが変更されたかチェック
      if (isMessageChanged(currentMessage, { value: parsedMessage, timestamp })) {
        console.log(`Updating message for topic ${topic}:`, parsedMessage);
        
        // メッセージを更新
        setMessages(prev => ({
          ...prev,
          [topic]: {
            value: parsedMessage,
            timestamp: timestamp,
            receivedAt: new Date().toISOString()
          }
        }));
      } else {
        console.log(`Message for topic ${topic} unchanged, skipping update`);
      }
    } catch (error) {
      console.error('Error updating messages:', error);
    }
  }, [messages]);

  // 設定のハッシュを生成
  const getConfigHash = (config: MQTTConfig | null): string => {
    if (!config) return '';
    return JSON.stringify({
      broker: config.broker,
      port: config.port,
      clientId: config.clientId,
      username: config.username,
      password: config.password,
      certificatePath: config.certificatePath,
      privateKeyPath: config.privateKeyPath,
      caPath: config.caPath
    });
  };

  // 接続をクリアする関数
  const clearConnection = useCallback(() => {
    console.log('Clearing connection...');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (subscribeTimeoutRef.current) {
      clearTimeout(subscribeTimeoutRef.current);
      subscribeTimeoutRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setIsConnected(false);
    setConnectionError(null);
    connectionIdRef.current = null;
    isConnectingRef.current = false;
    reconnectAttemptsRef.current = 0;
    uniqueClientIdRef.current = null; // 一意のクライアントIDもリセット
    // 重複メッセージチェックの状態もリセット
    lastProcessedMessageRef.current = null;
  }, []);

  // 自動再接続機能
  const attemptReconnect = useCallback(() => {
    // 設定が変更されている場合は再接続しない
    if (configRef.current && config && getConfigHash(config) !== getConfigHash(configRef.current)) {
      console.log('Config changed, skipping reconnection attempt');
      return;
    }
    
    // 設定がnullの場合は再接続しない
    if (!configRef.current) {
      console.log('No config available, skipping reconnection attempt');
      return;
    }
    
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      setConnectionError('接続に失敗しました。手動で再接続してください。');
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      console.log(`Attempting to reconnect (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
      reconnectAttemptsRef.current++;
      isConnectingRef.current = false;
      
      // 設定が有効な場合のみ再接続を試行
      if (configRef.current) {
        connectToBackend();
      }
    }, reconnectDelay);
  }, []);

  // WebSocket接続関数
  const connectToBackend = useCallback(() => {
    try {
      console.log('Starting connection to backend...');
      console.log('Current config:', configRef.current);
      isConnectingRef.current = true;
      setConnectionError(null);
      
      // Backend WebSocketサーバーに接続
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // ローカル開発環境ではバックエンドのポート3001に接続
      const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
      // 開発環境ではルートパス、本番環境では /ws パスを使用
      const wsPath = window.location.hostname === 'localhost' ? '' : '/ws';
      const wsUrl = `${protocol}//${host}${wsPath}`;
      console.log('WebSocket connection details:', {
        protocol,
        host,
        wsPath,
        wsUrl,
        windowLocation: {
          protocol: window.location.protocol,
          hostname: window.location.hostname,
          host: window.location.host,
          port: window.location.port
        }
      });
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // WebSocket接続タイムアウトを設定
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.error('WebSocket connection timeout');
          ws.close();
          setConnectionError('WebSocket connection timeout');
          setIsConnected(false);
          isConnectingRef.current = false;
          
          // 設定が有効で、接続試行回数が上限に達していない場合のみ再接続を試行
          if (configRef.current && reconnectAttemptsRef.current < maxReconnectAttempts && config) {
            attemptReconnect();
          }
        }
      }, 10000); // 10秒でタイムアウト

      ws.onopen = () => {
        console.log('WebSocket connected to backend');
        clearTimeout(connectionTimeout); // タイムアウトをクリア
        reconnectAttemptsRef.current = 0; // 接続成功時にリセット
        
        // 一意のクライアントIDを永続化（リロードしても同じIDを使用）
        const baseClientId = configRef.current!.clientId;
        const storageKey = `mqtt_client_id_${baseClientId}`;
        let persistedId = null as string | null;
        try {
          persistedId = localStorage.getItem(storageKey);
        } catch (e) {
          console.warn('localStorage not available, fallback to ephemeral clientId');
        }
        if (!persistedId) {
          persistedId = `${baseClientId}_${Date.now()}`;
          try {
            localStorage.setItem(storageKey, persistedId);
          } catch (e) {
            console.warn('Failed to persist clientId to localStorage');
          }
        }
        const uniqueClientId = persistedId;
        uniqueClientIdRef.current = uniqueClientId; // 一意のクライアントIDを保存
        
        const mqttConfig = {
          broker: configRef.current!.broker,
          port: configRef.current!.port,
          clientId: uniqueClientId,
          username: configRef.current!.username || '',
          password: configRef.current!.password || '',
          ...(configRef.current!.certificatePath && { certificatePath: configRef.current!.certificatePath }),
          ...(configRef.current!.privateKeyPath && { privateKeyPath: configRef.current!.privateKeyPath }),
          ...(configRef.current!.caPath && { caPath: configRef.current!.caPath })
        };
        
        console.log('Sending MQTT config to backend:', {
          ...mqttConfig,
          password: mqttConfig.password ? '***' : 'empty'
        });
        
        // AWS IoT Core接続のデバッグ情報
        console.log('AWS IoT Core connection details:', {
          broker: mqttConfig.broker,
          port: mqttConfig.port,
          clientId: mqttConfig.clientId,
          hasCertificate: !!mqttConfig.certificatePath,
          hasPrivateKey: !!mqttConfig.privateKeyPath,
          hasCA: !!mqttConfig.caPath,
          timestamp: new Date().toISOString()
        });
        
        // MQTT接続要求を送信
        ws.send(JSON.stringify({
          type: 'connect',
          config: mqttConfig
        }));
      };

      ws.onmessage = (event) => {
        try {
          console.log('Received WebSocket message:', event.data);
          const data = JSON.parse(event.data);
          
          // 重複メッセージチェック（mqtt_messageタイプの場合は特別な処理）
          if (data.type === 'mqtt_message') {
            const messageKey = {
              type: data.type,
              topic: data.topic,
              timestamp: data.timestamp
            };
            
            if (lastProcessedMessageRef.current &&
                lastProcessedMessageRef.current.type === messageKey.type &&
                lastProcessedMessageRef.current.topic === messageKey.topic &&
                lastProcessedMessageRef.current.timestamp === messageKey.timestamp) {
              console.log('Skipping duplicate mqtt_message:', messageKey);
              return;
            }
            
            // 新しいメッセージとして記録
            lastProcessedMessageRef.current = messageKey;
          } else {
            // その他のメッセージタイプの重複チェック
            const messageKey = {
              type: data.type,
              status: data.status,
              connectionId: data.connectionId
            };
            
            if (lastProcessedMessageRef.current &&
                lastProcessedMessageRef.current.type === messageKey.type &&
                lastProcessedMessageRef.current.status === messageKey.status &&
                lastProcessedMessageRef.current.connectionId === messageKey.connectionId) {
              console.log('Skipping duplicate message:', messageKey);
              return;
            }
            
            // 新しいメッセージとして記録
            lastProcessedMessageRef.current = messageKey;
          }
          
          switch (data.type) {
            case 'connection_status':
              console.log('Connection status update:', data);
              if (data.status === 'connecting') {
                console.log('MQTT connection initiated');
                connectionIdRef.current = data.connectionId;
                // 新しい接続開始時に重複チェックをリセット
                lastProcessedMessageRef.current = null;
              } else if (data.status === 'connected') {
                console.log('MQTT connected successfully');
                setIsConnected(true);
                setConnectionError(null);
                connectionIdRef.current = data.connectionId;
                isConnectingRef.current = false;
                reconnectAttemptsRef.current = 0; // 接続成功時にリセット
                
                // 接続開始時刻を記録
                connectionStartTimeRef.current = new Date();
                console.log('Connection started at:', connectionStartTimeRef.current.toISOString());
                
                // 接続成功後に全アセットのトピックを自動サブスクライブ
                if (subscribeTimeoutRef.current) {
                  clearTimeout(subscribeTimeoutRef.current);
                }
                
                subscribeTimeoutRef.current = setTimeout(() => {
                  console.log('Auto-subscribing to asset topics...');
                  console.log('Available factories:', factoriesRef.current);
                  
                  const allAssets = factoriesRef.current.flatMap(factory => 
                    factory.lines.flatMap(line => line.assets)
                  );
                  console.log('All assets:', allAssets);
                  const topics = allAssets
                    .filter(asset => asset.mqttTopic)
                    .map(asset => asset.mqttTopic);
                  
                  console.log('Topics to subscribe:', topics);
                  
                  if (topics.length === 0) {
                    console.warn('No topics found to subscribe. Using default topics...');
                    // デフォルトトピックをサブスクライブ
                    const defaultTopics = ['factory1/line1/temperature', 'factory1/line1/pressure', 'factory1/line2/vibration'];
                    defaultTopics.forEach(topic => {
                      console.log(`Subscribing to: ${topic}`);
                      subscribeRef.current?.(topic);
                    });
                  } else {
                    topics.forEach(topic => {
                      if (topic) {
                        console.log(`Subscribing to: ${topic}`);
                        subscribeRef.current?.(topic);
                      }
                    });
                  }
                  subscribeTimeoutRef.current = null;
                }, 2000);
                
                // 接続状態の定期的な監視を開始
                console.log('Starting connection monitoring...');
                const connectionMonitor = setInterval(() => {
                  if (!isConnected) {
                    console.log('Connection lost, stopping monitor');
                    clearInterval(connectionMonitor);
                    return;
                  }
                  console.log(`MQTT connection status: connected (${connectionIdRef.current})`);
                }, 30000); // 30秒間隔で監視
              } else if (data.status === 'error') {
                console.error('MQTT connection error:', data.error);
                setIsConnected(false);
                setConnectionError(`Connection error: ${data.error}`);
                connectionIdRef.current = null;
                isConnectingRef.current = false;
                
                if (subscribeTimeoutRef.current) {
                  clearTimeout(subscribeTimeoutRef.current);
                  subscribeTimeoutRef.current = null;
                }
                
                // 設定が有効で、接続試行回数が上限に達していない場合のみ再接続を試行
                if (configRef.current && reconnectAttemptsRef.current < maxReconnectAttempts && config) {
                  attemptReconnect();
                }
              } else if (data.status === 'disconnected') {
                console.log('MQTT disconnected');
                
                // 接続時間を計算
                const connectionDuration = connectionStartTimeRef.current ? 
                  Math.round((new Date().getTime() - connectionStartTimeRef.current.getTime()) / 1000) : 0;
                
                console.log('Disconnection details:', {
                  connectionId: data.connectionId,
                  timestamp: new Date().toISOString(),
                  wasConnected: isConnected,
                  connectionDuration: `${connectionDuration} seconds`
                });
                
                // 接続時間の分析
                if (connectionDuration <= 5) {
                  console.warn('⚠️  WARNING: Connection closed within 5 seconds - possible AWS IoT Core policy or client ID issue');
                } else if (connectionDuration >= 60 && connectionDuration <= 65) {
                  console.warn('⚠️  WARNING: Connection closed after ~1 minute - possible AWS IoT Core policy timeout');
                } else if (connectionDuration >= 120) {
                  console.log('✅  SUCCESS: Connection maintained for', connectionDuration, 'seconds');
                } else {
                  console.log('ℹ️  INFO: Connection closed after', connectionDuration, 'seconds');
                }
                
                setIsConnected(false);
                setConnectionError('Connection closed');
                connectionIdRef.current = null;
                isConnectingRef.current = false;
                connectionStartTimeRef.current = null; // 接続開始時刻をリセット
                
                if (subscribeTimeoutRef.current) {
                  clearTimeout(subscribeTimeoutRef.current);
                  subscribeTimeoutRef.current = null;
                }
                
                // 設定が有効で、接続試行回数が上限に達していない場合のみ再接続を試行
                if (configRef.current && reconnectAttemptsRef.current < maxReconnectAttempts && config) {
                  attemptReconnect();
                }
              }
              break;
              
            case 'mqtt_message':
              console.log('=== FRONTEND MQTT MESSAGE RECEIVED ===');
              console.log('Topic:', data.topic);
              console.log('Message:', data.message);
              console.log('Timestamp:', data.timestamp);
              console.log('Current messages state:', messages);
              
              // 最適化されたメッセージ更新関数を使用
              updateMessages(data.topic, data.message, data.timestamp);
              
              // アラートルールを評価
              console.log('Evaluating alert rules for topic:', data.topic);
              if (evaluateAlertRulesRef.current) {
                evaluateAlertRulesRef.current(data.topic, data.message).catch(error => {
                  console.error('Error evaluating alert rules:', error);
                });
              } else {
                console.warn('evaluateAlertRulesRef.current is undefined, skipping alert evaluation');
              }
              break;
              
            case 'subscribe_status':
              console.log('=== FRONTEND SUBSCRIBE STATUS ===');
              console.log('Status:', data.status);
              console.log('Topic:', data.topic);
              console.log('Error:', data.error);
              
              if (data.status === 'success') {
                console.log(`✅ Successfully subscribed to ${data.topic}`);
              } else {
                console.error(`❌ Failed to subscribe to ${data.topic}:`, data.error);
              }
              break;
              
            case 'publish_status':
              if (data.status === 'success') {
                console.log(`Published to ${data.topic}`);
              } else {
                console.error(`Failed to publish to ${data.topic}:`, data.error);
              }
              break;
              
            case 'error':
              console.error('WebSocket error:', data.error);
              setConnectionError(`WebSocket error: ${data.error}`);
              isConnectingRef.current = false;
              break;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        console.error('WebSocket error details:', {
          readyState: ws.readyState,
          url: ws.url,
          protocol: ws.protocol,
          extensions: ws.extensions
        });
        clearTimeout(connectionTimeout); // タイムアウトをクリア
        setConnectionError('Failed to connect to backend server');
        setIsConnected(false);
        isConnectingRef.current = false;
        
        // 設定が有効で、接続試行回数が上限に達していない場合のみ再接続を試行
        if (configRef.current && reconnectAttemptsRef.current < maxReconnectAttempts && config) {
          attemptReconnect();
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket connection closed');
        console.log('WebSocket close event details:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        clearTimeout(connectionTimeout); // タイムアウトをクリア
        setIsConnected(false);
        setConnectionError(`Backend connection lost (Code: ${event.code}, Reason: ${event.reason})`);
        connectionIdRef.current = null;
        isConnectingRef.current = false;
        
        if (subscribeTimeoutRef.current) {
          clearTimeout(subscribeTimeoutRef.current);
          subscribeTimeoutRef.current = null;
        }
        
        // 設定が有効で、接続試行回数が上限に達していない場合のみ再接続を試行
        if (configRef.current && reconnectAttemptsRef.current < maxReconnectAttempts && config) {
          attemptReconnect();
        }
      };

    } catch (error) {
      console.error('Failed to connect to backend:', error);
      setConnectionError(`Backend connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsConnected(false);
      isConnectingRef.current = false;
      
      // 設定が有効で、接続試行回数が上限に達していない場合のみ再接続を試行
      if (configRef.current && reconnectAttemptsRef.current < maxReconnectAttempts && config) {
        attemptReconnect();
      }
    }
  }, [config, attemptReconnect]);

  // WebSocket接続
  useEffect(() => {
    const configHash = getConfigHash(config);
    console.log('=== useMQTT useEffect ===');
    console.log('Config:', config);
    console.log('Config hash:', configHash);
    console.log('Previous config:', configRef.current ? getConfigHash(configRef.current) : 'null');
    console.log('Is connecting:', isConnectingRef.current);
    console.log('Is connected:', isConnected);
    console.log('Factories:', factories);
    console.log('Database connected:', databaseConnected);
    
    // データベースが接続されていない場合はMQTT接続を待機
    if (!databaseConnected) {
      console.log('Database not connected, waiting for database connection before MQTT connection...');
      setConnectionError('データベース接続完了後にMQTT接続を開始します...');
      setIsConnected(false);
      return;
    }
    
    // 設定が同じで、既に接続中または接続済みの場合は何もしない
    if (config && configRef.current && getConfigHash(config) === getConfigHash(configRef.current)) {
      if (isConnectingRef.current || isConnected) {
        console.log('Same config and already connected/connecting, skipping...');
        return;
      }
    }
    
    // 設定が変更された場合、既存の接続をクリア
    if (configRef.current && getConfigHash(config) !== getConfigHash(configRef.current)) {
      console.log('Config changed, clearing existing connection');
      clearConnection();
    }
    
    configRef.current = config;
    
    if (!config) {
      console.log('No config provided, disconnecting');
      clearConnection();
      return;
    }

    // Validate MQTT configuration
    if (!config.broker || !config.port || !config.clientId) {
      setConnectionError('Invalid MQTT configuration: broker, port, and clientId are required');
      setIsConnected(false);
      return;
    }

    // Validate broker format
    const brokerValidation = validateBroker(config.broker);
    const portValidation = validatePort(config.port);
    
    if (!brokerValidation.isValid) {
      setConnectionError(brokerValidation.error || 'Invalid broker configuration');
      setIsConnected(false);
      return;
    }
    
    if (!portValidation.isValid) {
      setConnectionError(portValidation.error || 'Invalid port configuration');
      setIsConnected(false);
      return;
    }

    // Validate authentication
    if (config.username && !config.password) {
      setConnectionError('Authentication failed: Password required when username is provided');
      setIsConnected(false);
      return;
    }

    // 既に接続中の場合は何もしない
    if (isConnectingRef.current) {
      console.log('Already connecting, skipping...');
      return;
    }

    console.log('Database connected, proceeding with MQTT connection...');
    console.log('Calling connectToBackend...');
    connectToBackend();

    // Cleanup function
    return () => {
      console.log('useMQTT cleanup function called');
      clearConnection();
    };
  }, [config?.broker, config?.port, config?.clientId, config?.username, config?.password, config?.certificatePath, config?.privateKeyPath, config?.caPath, databaseConnected, clearConnection, connectToBackend]);

  const subscribe = useCallback((topic: string) => {
    console.log('=== FRONTEND SUBSCRIBE REQUEST ===');
    console.log('Topic:', topic);
    console.log('Connection ID:', connectionIdRef.current);
    console.log('WebSocket ref:', wsRef.current);
    console.log('Config ref:', configRef.current);
    console.log('Original clientId:', configRef.current?.clientId);
    console.log('Unique clientId:', uniqueClientIdRef.current);
    
    if (!connectionIdRef.current || !wsRef.current) {
      console.warn(`Cannot subscribe to ${topic}: MQTT not connected`);
      console.warn('Connection details:', {
        connectionId: connectionIdRef.current,
        wsRef: !!wsRef.current,
        wsReadyState: wsRef.current?.readyState
      });
      return;
    }
    
    const subscribeData = {
      type: 'subscribe',
      clientId: uniqueClientIdRef.current, // 一意のクライアントIDを使用
      topic
    };
    
    console.log('Sending subscribe request:', subscribeData);
    wsRef.current.send(JSON.stringify(subscribeData));
    console.log('Subscribe request sent');
  }, []);

  // subscribeのrefを更新
  subscribeRef.current = subscribe;

  const publish = useCallback((topic: string, message: string) => {
    // connectionIdRef.currentを使用して接続状態を確認
    if (!connectionIdRef.current || !wsRef.current) {
      console.warn(`Cannot publish to ${topic}: MQTT not connected (connectionId: ${connectionIdRef.current})`);
      return;
    }
    
    console.log(`=== FRONTEND PUBLISH REQUEST ===`);
    console.log('Topic:', topic);
    console.log('Message:', message);
    console.log('Original clientId:', configRef.current?.clientId);
    console.log('Unique clientId:', uniqueClientIdRef.current);
    console.log('Connection ID:', connectionIdRef.current);
    console.log('WebSocket ready state:', wsRef.current.readyState);
    
    wsRef.current.send(JSON.stringify({
      type: 'publish',
      clientId: uniqueClientIdRef.current, // 一意のクライアントIDを使用
      topic,
      message
    }));
  }, []);

  const disconnect = useCallback(() => {
    console.log('Disconnect called');
    if (wsRef.current && uniqueClientIdRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'disconnect',
        clientId: uniqueClientIdRef.current // 一意のクライアントIDを使用
      }));
    }
    clearConnection();
  }, [clearConnection]);

  const evaluateAlertRules = useCallback(async (topic: string, message: any) => {
    console.log(`=== MQTT Alert Evaluation ===`);
    console.log('Topic:', topic);
    console.log('Message:', message);
    
    // アラート評価エンジンでメッセージを評価
    const newAlerts = await alertEvaluator.evaluateMessage(topic, message, new Date());
    
    if (newAlerts.length > 0) {
      console.log('New alerts generated:', newAlerts);
      // 新しいアラートが生成された場合の処理
      // ここでWebSocketを通じてフロントエンドに通知することも可能
    }

    // アセットステータスの更新をチェック（onAssetUpdateは呼び出さない）
    const allAssets = factoriesRef.current.flatMap(factory => 
      factory.lines.flatMap(line => line.assets)
    );
    const asset = allAssets.find(a => a.mqttTopic === topic);
    if (asset) {
      // アセットステータスがonlineに更新された場合のログ出力のみ
      console.log('Asset status would be updated to online:', asset.name);
      // 注意: onAssetUpdateは呼び出さない（選択されたアセットの状態を変更しないため）
    }
  }, []);

  // evaluateAlertRulesのrefを更新
  evaluateAlertRulesRef.current = evaluateAlertRules;

  // Helper functions for validation
  const validateBroker = (broker: string) => {
    if (!broker || broker.trim() === '') {
      return { isValid: false, error: 'Broker URL cannot be empty' };
    }
    
    const validPatterns = [
      /^localhost$/,
      /^127\.0\.0\.1$/,
      /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/,
      /^mqtt:\/\/[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})?$/,
      /^ssl:\/\/[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})?$/,
      /^ws:\/\/[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})?$/,
      /^wss:\/\/[a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})?$/
    ];
    
    const isValid = validPatterns.some(pattern => pattern.test(broker));
    
    if (!isValid) {
      return { isValid: false, error: `Invalid broker URL format: ${broker}` };
    }
    
    return { isValid: true, error: null };
  };

  const validatePort = (port: number) => {
    if (!port || port <= 0 || port > 65535) {
      return { isValid: false, error: `Invalid port number: ${port}. Must be between 1 and 65535` };
    }
    
    const commonPorts = [1883, 8883, 9001, 8083, 8084, 443];
    if (!commonPorts.includes(port)) {
      console.warn(`Warning: Port ${port} is not a common MQTT port. Common ports are: ${commonPorts.join(', ')}`);
    }
    
    return { isValid: true, error: null };
  };

  return {
    isConnected,
    messages,
    connectionError,
    subscribe,
    publish,
    disconnect
  };
};