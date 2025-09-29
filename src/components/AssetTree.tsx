import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Factory, Cpu, Settings, AlertTriangle, Plus, Trash2, Edit3 } from 'lucide-react';
import { Factory as FactoryType, ProductionLine, Asset } from '../types';

interface AssetTreeProps {
  factories: FactoryType[];
  onAssetSelect: (asset: Asset) => void;
  selectedAssetId?: string;
  isEditMode?: boolean;
  onAddFactory?: () => void;
  onDeleteFactory?: (factoryId: string) => void;
  onEditFactory?: (factoryId: string, newName: string) => void;
  onAddProductionLine?: (factoryId: string) => void;
  onDeleteProductionLine?: (factoryId: string, lineId: string) => void;
  onEditProductionLine?: (factoryId: string, lineId: string, newName: string) => void;
  onAddAsset?: (factoryId: string, lineId: string) => void;
  onDeleteAsset?: (factoryId: string, lineId: string, assetId: string) => void;
  onEditAsset?: (factoryId: string, lineId: string, assetId: string, updatedAsset: Partial<Asset>) => void;
}

export const AssetTree: React.FC<AssetTreeProps> = ({
  factories,
  onAssetSelect,
  selectedAssetId,
  isEditMode = false,
  onAddFactory,
  onDeleteFactory,
  onEditFactory,
  onAddProductionLine,
  onDeleteProductionLine,
  onEditProductionLine,
  onAddAsset,
  onDeleteAsset,
  onEditAsset
}) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [editingNode, setEditingNode] = useState<{ id: string; type: 'factory' | 'line' | 'asset'; parentId?: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const handleEditStart = (id: string, type: 'factory' | 'line' | 'asset', currentName: string, parentId?: string) => {
    setEditingNode({ id, type, parentId });
    setEditValue(currentName);
  };

  const handleEditSave = () => {
    if (!editingNode || !editValue.trim()) return;

    switch (editingNode.type) {
      case 'factory':
        onEditFactory?.(editingNode.id, editValue.trim());
        break;
      case 'line':
        onEditProductionLine?.(editingNode.parentId!, editingNode.id, editValue.trim());
        break;
      case 'asset':
        // アセットの場合は、factoryIdを取得する必要がある
        const factory = factories.find(f => 
          f.lines.some(l => l.id === editingNode.parentId)
        );
        if (factory) {
          onEditAsset?.(factory.id, editingNode.parentId!, editingNode.id, { name: editValue.trim() });
        }
        break;
    }

    setEditingNode(null);
    setEditValue('');
  };

  const handleEditCancel = () => {
    setEditingNode(null);
    setEditValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditSave();
    } else if (e.key === 'Escape') {
      handleEditCancel();
    }
  };

  const handleDeleteFactory = (factoryId: string, factoryName: string) => {
    if (window.confirm(`工場「${factoryName}」を削除してもよろしいですか？\n\nこの工場に含まれるすべての設備とアセットも削除されます。`)) {
      onDeleteFactory?.(factoryId);
    }
  };

  const handleDeleteProductionLine = (factoryId: string, lineId: string, lineName: string) => {
    if (window.confirm(`設備「${lineName}」を削除してもよろしいですか？\n\nこの設備に含まれるすべてのアセットも削除されます。`)) {
      onDeleteProductionLine?.(factoryId, lineId);
    }
  };

  const handleDeleteAsset = (factoryId: string, lineId: string, assetId: string, assetName: string) => {
    if (window.confirm(`アセット「${assetName}」を削除してもよろしいですか？\n\nこのアセットの設定とアラートルールも削除されます。`)) {
      onDeleteAsset?.(factoryId, lineId, assetId);
    }
  };

  const renderFactory = (factory: FactoryType) => (
    <div key={factory.id} className="mb-2">
      <div className="flex items-center py-2 px-3 hover:bg-gray-800 rounded cursor-pointer group">
        <div className="flex items-center flex-1" onClick={() => toggleNode(factory.id)}>
          {expandedNodes.has(factory.id) ? (
            <ChevronDown size={16} className="text-gray-400 mr-2" />
          ) : (
            <ChevronRight size={16} className="text-gray-400 mr-2" />
          )}
          <Factory size={16} className="text-blue-400 mr-2" />
          {editingNode?.id === factory.id && editingNode.type === 'factory' ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyPress}
              onBlur={handleEditSave}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm flex-1"
              autoFocus
            />
          ) : (
            <span className="text-white">{factory.name}</span>
          )}
        </div>
        
        {isEditMode && (
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditStart(factory.id, 'factory', factory.name);
              }}
              className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded"
              title="編集"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddProductionLine?.(factory.id);
              }}
              className="p-1 text-gray-400 hover:text-green-400 hover:bg-gray-700 rounded"
              title="設備追加"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFactory(factory.id, factory.name);
              }}
              className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
              title="削除"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
      
      {expandedNodes.has(factory.id) && (
        <div className="ml-4">
          {factory.lines.map((line) => renderProductionLine(line, factory.id))}
          {isEditMode && (
            <button
              onClick={() => onAddProductionLine?.(factory.id)}
              className="flex items-center py-1 px-3 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded text-sm w-full"
            >
              <Plus size={12} className="mr-2" />
              設備を追加
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderProductionLine = (line: ProductionLine, factoryId: string) => (
    <div key={line.id} className="mb-1">
      <div className="flex items-center py-2 px-3 hover:bg-gray-800 rounded cursor-pointer group">
        <div className="flex items-center flex-1" onClick={() => toggleNode(line.id)}>
          {expandedNodes.has(line.id) ? (
            <ChevronDown size={16} className="text-gray-400 mr-2" />
          ) : (
            <ChevronRight size={16} className="text-gray-400 mr-2" />
          )}
          <Settings size={16} className="text-green-400 mr-2" />
          {editingNode?.id === line.id && editingNode.type === 'line' ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyPress}
              onBlur={handleEditSave}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm flex-1"
              autoFocus
            />
          ) : (
            <span className="text-white">{line.name}</span>
          )}
        </div>
        
        {isEditMode && (
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditStart(line.id, 'line', line.name, factoryId);
              }}
              className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded"
              title="編集"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddAsset?.(factoryId, line.id);
              }}
              className="p-1 text-gray-400 hover:text-green-400 hover:bg-gray-700 rounded"
              title="アセット追加"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteProductionLine(factoryId, line.id, line.name);
              }}
              className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
              title="削除"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
      
      {expandedNodes.has(line.id) && (
        <div className="ml-4">
          {line.assets.map((asset) => renderAsset(asset, factoryId, line.id))}
          {isEditMode && (
            <button
              onClick={() => onAddAsset?.(factoryId, line.id)}
              className="flex items-center py-1 px-3 text-gray-400 hover:text-green-400 hover:bg-gray-800 rounded text-sm w-full"
            >
              <Plus size={12} className="mr-2" />
              アセットを追加
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderAsset = (asset: Asset, factoryId: string, lineId: string) => (
    <div
      key={asset.id}
      className={`flex items-center py-2 px-3 hover:bg-gray-800 rounded cursor-pointer group ${
        selectedAssetId === asset.id ? 'bg-blue-900' : ''
      } ${asset.isAlertActive ? 'bg-red-900/20 border border-red-500/30' : ''}`}
    >
      <div className="flex items-center flex-1" onClick={() => onAssetSelect(asset)}>
        <Cpu size={16} className={`mr-2 ${getStatusColor(asset.status)}`} />
        {editingNode?.id === asset.id && editingNode.type === 'asset' ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyPress}
            onBlur={handleEditSave}
            className="bg-gray-700 text-white px-2 py-1 rounded text-sm flex-1"
            autoFocus
          />
        ) : (
          <span className={`text-sm ${asset.isAlertActive ? 'text-red-300 font-semibold' : 'text-white'}`}>
            {asset.name}
          </span>
        )}
      </div>
      
      <div className="flex items-center space-x-2">
        {/* アラート状態表示 */}
        {asset.isAlertActive && (
          <AlertTriangle size={14} className="text-red-400" />
        )}
        {asset.hasUnsavedChanges && (
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
        )}
        <div className={`w-2 h-2 rounded-full ${
          asset.isAlertActive ? 'bg-red-500' :
          asset.status === 'online' ? 'bg-green-500' :
          asset.status === 'warning' ? 'bg-yellow-500' :
          asset.status === 'error' ? 'bg-red-500' : 'bg-gray-500'
        }`} />
        
        {isEditMode && (
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditStart(asset.id, 'asset', asset.name, lineId);
              }}
              className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded"
              title="編集"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteAsset(factoryId, lineId, asset.id, asset.name);
              }}
              className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
              title="削除"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-gray-900 p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold flex items-center">
          <Factory className="mr-2" size={20} />
          Asset Hierarchy
        </h2>
        {isEditMode && onAddFactory && (
          <button
            onClick={onAddFactory}
            className="flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
          >
            <Plus size={14} className="mr-1" />
            工場追加
          </button>
        )}
      </div>
      
      {factories.map(renderFactory)}
      
      {factories.length === 0 && (
        <div className="text-center text-gray-400 py-8">
          <Factory size={48} className="mx-auto mb-4 opacity-50" />
          <p>工場がありません</p>
          {isEditMode && onAddFactory && (
            <button
              onClick={onAddFactory}
              className="mt-4 flex items-center mx-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              <Plus size={16} className="mr-2" />
              最初の工場を追加
            </button>
          )}
        </div>
      )}
    </div>
  );
};