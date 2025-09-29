export interface AssetType {
  value: string;
  label: string;
  description?: string;
}

export const ASSET_TYPES: AssetType[] = [
  {
    value: 'sensor',
    label: 'センサー',
    description: '温度、圧力、流量などの測定を行うセンサー'
  },
  {
    value: 'actuator',
    label: 'アクチュエーター',
    description: '電気信号を機械的な動きに変換する装置'
  },
  {
    value: 'controller',
    label: 'コントローラー',
    description: 'プロセス制御を行う制御装置'
  },
  {
    value: 'motor',
    label: 'モーター',
    description: '電気エネルギーを機械エネルギーに変換する装置'
  },
  {
    value: 'pump',
    label: 'ポンプ',
    description: '液体や気体を輸送する装置'
  },
  {
    value: 'valve',
    label: 'バルブ',
    description: '流体の流れを制御する装置'
  },
  {
    value: 'conveyor',
    label: 'コンベヤー',
    description: '物資を輸送する装置'
  },
  {
    value: 'robot',
    label: 'ロボット',
    description: '自動化された作業を行うロボット'
  },
  {
    value: 'camera',
    label: 'カメラ',
    description: '画像や動画を取得する装置'
  },
  {
    value: 'other',
    label: 'その他',
    description: 'その他の装置'
  }
];

export const getAssetTypeLabel = (value: string): string => {
  const assetType = ASSET_TYPES.find(type => type.value === value);
  return assetType ? assetType.label : value;
};

export const getAssetTypeDescription = (value: string): string => {
  const assetType = ASSET_TYPES.find(type => type.value === value);
  return assetType ? assetType.description || '' : '';
};
