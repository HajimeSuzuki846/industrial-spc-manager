import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, Edit3 } from 'lucide-react';

interface EditModeAuthProps {
  onAuthSuccess: () => void;
  onCancel: () => void;
}

export const EditModeAuth: React.FC<EditModeAuthProps> = ({ onAuthSuccess, onCancel }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 初期パスワードはGlico2030
  const EDIT_MODE_PASSWORD = 'Glico2030';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // フロントエンド側でパスワードを検証
      if (password === EDIT_MODE_PASSWORD) {
        onAuthSuccess();
      } else {
        setError('編集モードパスワードが正しくありません');
      }
    } catch (error) {
      setError('認証エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-96 max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <Edit3 className="mr-2" size={24} />
            編集モード認証
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              編集モードパスワード
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                placeholder="パスワードを入力"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="flex items-center text-red-400 text-sm">
                <AlertCircle className="mr-2" size={16} />
                {error}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '認証中...' : '認証'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
