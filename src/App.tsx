import { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { AssetTree } from './components/AssetTree';
import { AssetDetail } from './components/AssetDetail';
import { AdminAuth } from './components/AdminAuth';
import { AdminSettings } from './components/AdminSettings';
import { ConnectionStatus } from './components/ConnectionStatus';
import { SystemStatusCheck } from './components/SystemStatusCheck';
import { EditModeAuth } from './components/EditModeAuth';
import { Factory, Asset, MQTTConfig as MQTTConfigType, ProductionLine } from './types';
import { mockFactories } from './data/mockData';
import { useMQTT } from './hooks/useMQTT';
import { useDatabaseStatus } from './hooks/useDatabaseStatus';
import { useInfluxDBStatus } from './hooks/useInfluxDBStatus';
import { useDataSync } from './hooks/useDataSync';
import { Factory as FactoryIcon, Monitor, Shield, Edit3, Plus, Trash2, Home } from 'lucide-react';
import { HomeDashboard } from './components/HomeDashboard';

const App = memo(() => {
  const [factories, setFactories] = useState<Factory[]>(mockFactories);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(() => {
    const savedId = localStorage.getItem('assetManager_selectedAssetId');
    if (savedId) {
      try { return JSON.parse(savedId); } catch {}
    }
    const legacy = localStorage.getItem('assetManager_selectedAsset');
    if (legacy) {
      try { const obj = JSON.parse(legacy); return obj?.id || null; } catch {}
    }
    return null;
  });
  const [showHome, setShowHome] = useState(() => {
    const saved = localStorage.getItem('assetManager_showHome');
    return saved ? JSON.parse(saved) : true;
  });
  const [mqttConfig, setMqttConfig] = useState<MQTTConfigType | null>(null);
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [showEditModeAuth, setShowEditModeAuth] = useState(false);
  
  // showAdminAuthの状態変化をログに出力
  useEffect(() => {
    console.log('App.tsx: showAdminAuthの状態が変更されました:', showAdminAuth);
  }, [showAdminAuth]);

  // showHomeの状態をlocalStorageに保存
  useEffect(() => {
    localStorage.setItem('assetManager_showHome', JSON.stringify(showHome));
  }, [showHome]);

  // 選択アセットIDをlocalStorageに保存
  useEffect(() => {
    if (selectedAssetId) {
      localStorage.setItem('assetManager_selectedAssetId', JSON.stringify(selectedAssetId));
    } else {
      localStorage.removeItem('assetManager_selectedAssetId');
    }
  }, [selectedAssetId]);
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // リロード時は編集モードを必ずOFFにし、永続化もしない
  useEffect(() => {
    setIsEditMode(false);
    localStorage.removeItem('assetManager_editMode');
  }, []);
  // Thingsboard は廃止

  // URLパラメータまたはlocalStorageをチェックして管理者設定画面を直接表示するかどうかを決定
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const showAdmin = urlParams.get('admin');
    const forceAdminSettings = localStorage.getItem('forceAdminSettings');
    
    if (showAdmin === 'true' || forceAdminSettings === 'true') {
      setShowAdminAuth(true);
      // localStorageのフラグをクリア
      localStorage.removeItem('forceAdminSettings');
    }
  }, []);

  // データベース同期フック
  const { 
    loadFactories, 
    saveFactory, 
    deleteFactory, 
    saveProductionLine, 
    deleteProductionLine, 
    saveAssetToDB, 
    deleteAsset,
    isLoading: dataLoading,
    error: dataError 
  } = useDataSync();

  // 全アセットを取得する関数
  const getAllAssets = (): Asset[][] => {
    return factories.map(factory => 
      factory.lines.flatMap(line => line.assets)
    );
  };

  // メモ化されたアセット更新ハンドラー
  const handleAssetUpdate = useCallback(async (updatedAsset: Asset) => {
    console.log('App: handleAssetUpdate called with:', updatedAsset);
    
    // データベースに保存
    const success = await saveAssetToDB(updatedAsset);
    if (!success) {
      console.error('Failed to save asset to database');
      return;
    }
    
    // ローカルステートを更新
    setFactories(prev => {
      const newFactories = prev.map(factory => ({
        ...factory,
        lines: factory.lines.map(line => ({
          ...line,
          assets: line.assets.map(asset =>
            asset.id === updatedAsset.id ? updatedAsset : asset
          )
        }))
      }));
      
      return newFactories;
    });

  }, [saveAssetToDB]);

  // メモ化されたアセット選択ハンドラー
  const handleAssetSelect = useCallback((asset: Asset) => {
    console.log('App: handleAssetSelect called with:', asset);
    setSelectedAssetId(asset.id);
    setShowHome(false);
  }, []);

  // メモ化されたMQTT設定更新ハンドラー
  const handleConfigUpdate = useCallback((newConfig: MQTTConfigType, isInitialLoad: boolean = false) => {
    console.log('App: handleConfigUpdate called with:', newConfig);
    setMqttConfig(newConfig);
    
    // 初期読み込みでない場合は、設定をlocalStorageに保存
    if (!isInitialLoad) {
      localStorage.setItem('mqttConfig', JSON.stringify(newConfig));
    }
  }, []);

  // メモ化された管理者認証成功ハンドラー
  const handleAdminAuthSuccess = useCallback(() => {
    console.log('App: Admin authentication successful');
    setShowAdminAuth(false);
    setShowAdminSettings(true);
  }, []);

  // メモ化された管理者認証キャンセルハンドラー
  const handleAdminAuthCancel = useCallback(() => {
    console.log('App: Admin authentication cancelled');
    setShowAdminAuth(false);
  }, []);

  // メモ化された管理者設定クローズハンドラー
  const handleAdminSettingsClose = useCallback(() => {
    console.log('App: Admin settings closed');
    setShowAdminSettings(false);
  }, []);

  // メモ化されたファクトリー追加ハンドラー
  const handleAddFactory = useCallback(async () => {
    const newFactory: Factory = {
      id: `factory_${Date.now()}`,
      name: `新ファクトリー`,
      lines: []
    };

    try {
      const success = await saveFactory(newFactory);
      if (success) {
        setFactories(prev => [...prev, newFactory]);
      } else {
        console.error('Failed to save factory to database');
      }
    } catch (error: any) {
      console.error('Failed to add factory:', error);
    }
  }, [saveFactory]);

  // メモ化されたファクトリー削除ハンドラー
  const handleDeleteFactory = useCallback(async (factoryId: string) => {
    try {
      const success = await deleteFactory(factoryId);
      if (success) {
        setFactories(prev => prev.filter(factory => factory.id !== factoryId));
        if (selectedAssetId && factories.find(f => f.id === factoryId)?.lines.some(l => l.assets.some(a => a.id === selectedAssetId))) {
          setSelectedAssetId(null);
        }
      } else {
        console.error('Failed to delete factory from database');
      }
    } catch (error: any) {
      console.error('Failed to delete factory:', error);
    }
  }, [deleteFactory, selectedAssetId, factories]);

  // メモ化されたファクトリー編集ハンドラー
  const handleEditFactory = useCallback(async (factoryId: string, newName: string) => {
    const factory = factories.find(f => f.id === factoryId);
    if (!factory) return;

    const updatedFactory = { ...factory, name: newName };
    const success = await saveFactory(updatedFactory);
    if (success) {
      setFactories(prev =>
        prev.map(factory =>
          factory.id === factoryId ? { ...factory, name: newName } : factory
        )
      );
    } else {
      console.error('Failed to update factory in database');
    }
  }, [factories, saveFactory]);

  // メモ化された生産ライン追加ハンドラー
  const handleAddProductionLine = useCallback(async (factoryId: string) => {
    const newLine: ProductionLine = {
      id: `line_${Date.now()}`,
      name: `新ライン`,
      factoryId: factoryId,
      assets: []
    };

    try {
      const success = await saveProductionLine(newLine);
      if (success) {
        setFactories(prev =>
          prev.map(factory =>
            factory.id === factoryId
              ? { ...factory, lines: [...factory.lines, newLine] }
              : factory
          )
        );
      } else {
        console.error('Failed to save production line to database');
      }
    } catch (error: any) {
      console.error('Failed to add production line:', error);
    }
  }, [saveProductionLine]);

  // メモ化された生産ライン削除ハンドラー
  const handleDeleteProductionLine = useCallback(async (factoryId: string, lineId: string) => {
    try {
      const success = await deleteProductionLine(lineId);
      if (success) {
        setFactories(prev =>
          prev.map(factory =>
            factory.id === factoryId
              ? { ...factory, lines: factory.lines.filter(line => line.id !== lineId) }
              : factory
          )
        );
        if (selectedAssetId && factories.find(f => f.id === factoryId)?.lines.find(l => l.id === lineId)?.assets.some(a => a.id === selectedAssetId)) {
          setSelectedAssetId(null);
        }
      } else {
        console.error('Failed to delete production line from database');
      }
    } catch (error: any) {
      console.error('Failed to delete production line:', error);
    }
  }, [deleteProductionLine, selectedAssetId, factories]);

  // メモ化された生産ライン編集ハンドラー
  const handleEditProductionLine = useCallback(async (factoryId: string, lineId: string, newName: string) => {
    const line = factories.find(f => f.id === factoryId)?.lines.find(l => l.id === lineId);
    if (!line) return;

    const updatedLine = { ...line, name: newName };
    const success = await saveProductionLine(updatedLine);
    if (success) {
      setFactories(prev =>
        prev.map(factory =>
          factory.id === factoryId
            ? {
                ...factory,
                lines: factory.lines.map(line =>
                  line.id === lineId ? { ...line, name: newName } : line
                )
              }
            : factory
        )
      );
    } else {
      console.error('Failed to update production line in database');
    }
  }, [factories, saveProductionLine]);

  // メモ化されたアセット追加ハンドラー
  const handleAddAsset = useCallback(async (factoryId: string, lineId: string) => {
    const newAsset: Asset = {
      id: `temp_${Date.now()}`, // 一時的なID（AssetFormでUUIDに置き換えられる）
      name: `新アセット`,
      type: 'sensor',
      lineId: lineId,
      status: 'offline',
      dataSourceType: 'mqtt',
      mqttTopic: `factory${factoryId}/line${lineId}/asset${Date.now()}`,
      alertRules: []
    };

    try {
      const success = await saveAssetToDB(newAsset);
      if (success) {
        setFactories(prev =>
          prev.map(factory =>
            factory.id === factoryId
              ? {
                  ...factory,
                  lines: factory.lines.map(line =>
                    line.id === lineId
                      ? { ...line, assets: [...line.assets, newAsset] }
                      : line
                  )
                }
              : factory
          )
        );
      } else {
        console.error('Failed to save asset to database');
      }
    } catch (error: any) {
      console.error('Failed to add asset:', error);
    }
  }, [saveAssetToDB]);

  // メモ化されたアセット削除ハンドラー
  const handleDeleteAsset = useCallback(async (factoryId: string, lineId: string, assetId: string) => {
    try {
      const success = await deleteAsset(assetId);
      if (success) {
        setFactories(prev =>
          prev.map(factory =>
            factory.id === factoryId
              ? {
                  ...factory,
                  lines: factory.lines.map(line =>
                    line.id === lineId
                      ? { ...line, assets: line.assets.filter(asset => asset.id !== assetId) }
                      : line
                  )
                }
              : factory
          )
        );
        if (selectedAssetId === assetId) {
          setSelectedAssetId(null);
        }
      } else {
        console.error('Failed to delete asset from database');
      }
    } catch (error: any) {
      console.error('Failed to delete asset:', error);
    }
  }, [deleteAsset, selectedAssetId]);

  // メモ化されたアセット編集ハンドラー
  const handleEditAsset = useCallback(async (factoryId: string, lineId: string, assetId: string, updatedAsset: Partial<Asset>) => {
    const asset = factories
      .find(f => f.id === factoryId)
      ?.lines.find(l => l.id === lineId)
      ?.assets.find(a => a.id === assetId);
    
    if (!asset) return;

    const updatedAssetData = { ...asset, ...updatedAsset };
    
    try {
      const success = await saveAssetToDB(updatedAssetData);
      if (success) {
        setFactories(prev =>
          prev.map(factory =>
            factory.id === factoryId
              ? {
                  ...factory,
                  lines: factory.lines.map(line =>
                    line.id === lineId
                      ? {
                          ...line,
                          assets: line.assets.map(asset =>
                            asset.id === assetId ? { ...asset, ...updatedAsset } : asset
                          )
                        }
                      : line
                  )
                }
              : factory
          )
        );

      }
    } catch (error: any) {
      console.error('Failed to update asset in database:', error);
      
      // MQTTトピックの重複エラーの場合、ユーザーに通知
      if (error.message && error.message.includes('既に他のアセットで使用されています')) {
        alert(`保存に失敗しました: ${error.message}`);
      }
    }
  }, [factories, saveAssetToDB]);


  
  // データベース接続状態を取得
  const { isConnected: dbConnected, error: dbError } = useDatabaseStatus();
  
  const { isConnected, messages, connectionError, disconnect, publish } = useMQTT({
    config: mqttConfig,
    factories: factories,
    onAssetUpdate: handleAssetUpdate,
    databaseConnected: dbConnected // データベース接続状態を渡す
  });
  
  // InfluxDB接続状態を取得
  const { isConnected: influxdbConnected, error: influxdbError } = useInfluxDBStatus();
  


  // メモ化されたファクトリーデータ読み込み
  useEffect(() => {
    const loadData = async () => {
      try {
        const loadedFactories = await loadFactories();
        if (loadedFactories.length > 0) {
          setFactories(loadedFactories);
        }
      } catch (error) {
        console.error('Failed to load factories:', error);
      }
    };
    loadData();
  }, [loadFactories]);

  // メモ化されたMQTT設定読み込み
  useEffect(() => {
    const savedConfig = localStorage.getItem('mqttConfig');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        setMqttConfig(config);
        handleConfigUpdate(config, true);
      } catch (error) {
        console.error('Failed to parse saved MQTT config:', error);
      }
    }
  }, [handleConfigUpdate]);

  // メモ化された編集モード保存
  useEffect(() => {
    localStorage.setItem('assetManager_editMode', JSON.stringify(isEditMode));
  }, [isEditMode]);

  // Thingsboardデバイス読み込みは削除

  // メモ化されたホーム表示切り替え
  const handleHomeClick = useCallback(() => {
    setShowHome(true);
    setSelectedAssetId(null);
  }, []);

  // メモ化された編集モード切り替え
  const handleEditModeToggle = useCallback(() => {
    if (isEditMode) {
      // 編集モードをOFFにする場合はパスワード不要
      setIsEditMode(false);
    } else {
      // 編集モードをONにする場合はパスワード認証を要求
      setShowEditModeAuth(true);
    }
  }, [isEditMode]);

  // メモ化された管理者設定表示
  const handleAdminClick = useCallback(() => {
    setShowAdminAuth(true);
  }, []);

  // 編集モード認証成功時のハンドラー
  const handleEditModeAuthSuccess = useCallback(() => {
    setIsEditMode(true);
    setShowEditModeAuth(false);
  }, []);

  // 編集モード認証キャンセル時のハンドラー
  const handleEditModeAuthCancel = useCallback(() => {
    setShowEditModeAuth(false);
  }, []);

  // 選択中アセットをIDから解決
  const selectedAsset = useMemo(() => {
    if (!selectedAssetId) return null;
    for (const f of factories) {
      for (const l of f.lines) {
        const a = l.assets.find(x => x.id === selectedAssetId);
        if (a) return a;
      }
    }
    return null;
  }, [selectedAssetId, factories]);

  // メモ化されたアセット詳細コンポーネント
  const assetDetailComponent = useMemo(() => {
    if (!selectedAsset) return null;
    return (
      <AssetDetail
        key={selectedAsset.id}
        asset={selectedAsset}
        onAssetUpdate={handleAssetUpdate}
        mqttMessages={messages}
        isEditMode={isEditMode}
        publish={publish}
      />
    );
  }, [selectedAsset, handleAssetUpdate, messages, isEditMode, publish]);

  // メモ化されたホームダッシュボードコンポーネント
  const homeDashboardComponent = useMemo(() => {
    if (!showHome) return null;
    
    // Get all assets from factories
    const allAssets = factories.flatMap(factory => 
      factory.lines.flatMap(line => line.assets)
    );
    
    return (
      <HomeDashboard
        mqttConnected={isConnected}
        databaseConnected={dbConnected}
        influxdbConnected={influxdbConnected}
        assets={allAssets}
      />
    );
  }, [showHome, isConnected, dbConnected, influxdbConnected, factories]);

  // メモ化されたアセットツリーコンポーネント
  const assetTreeComponent = useMemo(() => {
    return (
      <AssetTree
        factories={factories}
        onAssetSelect={handleAssetSelect}
        selectedAssetId={selectedAssetId || undefined}
        isEditMode={isEditMode}
        onAddFactory={handleAddFactory}
        onDeleteFactory={handleDeleteFactory}
        onEditFactory={handleEditFactory}
        onAddProductionLine={handleAddProductionLine}
        onDeleteProductionLine={handleDeleteProductionLine}
        onEditProductionLine={handleEditProductionLine}
        onAddAsset={handleAddAsset}
        onDeleteAsset={handleDeleteAsset}
        onEditAsset={handleEditAsset}
      />
    );
  }, [
    factories,
    handleAssetSelect,
    selectedAsset?.id,
    isEditMode,
    handleAddFactory,
    handleDeleteFactory,
    handleEditFactory,
    handleAddProductionLine,
    handleDeleteProductionLine,
    handleEditProductionLine,
    handleAddAsset,
    handleDeleteAsset,
    handleEditAsset
  ]);

  // メモ化された接続状態コンポーネント
  const connectionStatusComponent = useMemo(() => {
    return (
      <ConnectionStatus
        mqttConnected={isConnected}
        mqttError={connectionError}
        databaseConnected={dbConnected}
        databaseError={dbError}
        influxdbConnected={influxdbConnected}
        influxdbError={influxdbError}
      />
    );
  }, [isConnected, connectionError, dbConnected, dbError, influxdbConnected, influxdbError]);

  // メモ化された管理者認証モーダル
  const adminAuthModal = useMemo(() => {
    if (!showAdminAuth) return null;
    
    return (
      <AdminAuth
        onAuthSuccess={handleAdminAuthSuccess}
        onCancel={handleAdminAuthCancel}
      />
    );
  }, [showAdminAuth, handleAdminAuthSuccess, handleAdminAuthCancel]);

  // メモ化された管理者設定モーダル
  const adminSettingsModal = useMemo(() => {
    if (!showAdminSettings) return null;
    
    return (
      <AdminSettings 
        onClose={handleAdminSettingsClose}
        onConfigUpdate={handleConfigUpdate}
        isConnected={isConnected}
        connectionError={connectionError}
        onSystemStatusCheck={() => {
          // ページ再読み込みせずに SystemStatusCheck を再評価する
          setStatusCheckNonce((n) => n + 1);
        }}
      />
    );
  }, [showAdminSettings, handleAdminSettingsClose, handleConfigUpdate, isConnected, connectionError]);

    // SystemStatusCheck の再評価用のキー
    const [statusCheckNonce, setStatusCheckNonce] = useState(0);

    return (
    <>
      <SystemStatusCheck key={statusCheckNonce} onShowAdminSettings={() => {
        console.log('App.tsx: onShowAdminSettingsコールバックが実行されました');
        setShowAdminAuth(true);
      }}>
        <div className="h-screen bg-gray-900 flex flex-col">
          {/* Top Header */}
          <div className="bg-gray-800 border-b border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <FactoryIcon className="text-blue-400 mr-3" size={28} />
                  <h1 className="text-xl font-bold text-white">Asset Manager</h1>
                </div>
                <button
                  onClick={handleHomeClick}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                    showHome 
                      ? 'text-blue-400 bg-blue-900/20 border border-blue-500/30' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  <Home size={16} />
                  <span className="text-sm font-medium">HOME</span>
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleEditModeToggle}
                  className={`p-2 rounded-lg transition-colors ${
                    isEditMode 
                      ? 'text-blue-400 bg-blue-900/20 border border-blue-500/30' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                  title="編集モード"
                >
                  <Edit3 size={20} />
                </button>
                <button
                  onClick={handleAdminClick}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  title="管理者設定"
                >
                  <Shield size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex flex-1">
            {/* Sidebar */}
            <div className="w-80 min-w-80 border-r border-gray-700 flex flex-col">
              {/* Tree View */}
              <div className="flex-1">
                {assetTreeComponent}
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0 flex flex-col">
              {showHome ? (
                homeDashboardComponent
              ) : selectedAsset ? (
                assetDetailComponent
              ) : (
                <div className="flex-1 flex items-center justify-center bg-gray-800">
                  <div className="text-center">
                    <Monitor className="mx-auto text-gray-500 mb-4" size={64} />
                    <h2 className="text-2xl font-bold text-white mb-2">アセットを選択</h2>
                    <p className="text-gray-400 max-w-md">
                      左側の階層からアセットを選択して、詳細情報の確認、アラートルールの設定、リアルタイムデータの監視を行ってください。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Connection Status Indicator */}
          {connectionStatusComponent}
        </div>
      </SystemStatusCheck>

      {/* Admin Authentication Modal - SystemStatusCheckの外側に配置 */}
      {adminAuthModal}

      {/* Edit Mode Authentication Modal - SystemStatusCheckの外側に配置 */}
      {showEditModeAuth && (
        <EditModeAuth
          onAuthSuccess={handleEditModeAuthSuccess}
          onCancel={handleEditModeAuthCancel}
        />
      )}

      {/* Admin Settings Modal - SystemStatusCheckの外側に配置 */}
      {adminSettingsModal}
    </>
  );
});

export default App;