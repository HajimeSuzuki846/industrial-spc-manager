import React from 'react';
import { Asset } from '../types';

interface AssetDetailProps {
  asset: Asset;
}

export const AssetDetail: React.FC<AssetDetailProps> = React.memo(({ asset }) => {
  return (
    <div className="bg-gray-800 h-full min-w-0 overflow-hidden relative">
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div>
              <h2 className="text-2xl font-bold text-white">{asset.name}</h2>
              <div className="flex items-center space-x-4">
                <p className="text-gray-400">Asset</p>
                <div className="flex items-center text-gray-500 text-sm">
                  <span className="font-mono">{asset.id}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="p-6 min-w-0">
      </div>
    </div>
  );
});


