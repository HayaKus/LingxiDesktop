import React, { useEffect, useState } from 'react';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { useChatStore } from './store/chatStore';
import { aiService } from './utils/aiService';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const error = useChatStore((state) => state.error);
  const clearMessages = useChatStore((state) => state.clearMessages);

  useEffect(() => {
    // 加载配置
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await window.electronAPI.getConfig();
      if (config?.apiKey) {
        setApiKey(config.apiKey);
        aiService.initialize(config.apiKey);
      } else {
        setShowConfig(true);
      }
    } catch (error) {
      console.error('Load config failed:', error);
      setShowConfig(true);
    }
  };

  const saveApiKey = async () => {
    if (!tempApiKey.trim()) {
      alert('请输入 API Key');
      return;
    }

    try {
      await window.electronAPI.saveConfig({ apiKey: tempApiKey });
      setApiKey(tempApiKey);
      aiService.initialize(tempApiKey);
      setShowConfig(false);
      clearMessages();
    } catch (error) {
      console.error('Save config failed:', error);
      alert('保存配置失败');
    }
  };

  // 配置界面
  if (showConfig) {
    return (
      <div className="w-screen h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            🐕 导盲犬
          </h1>
          <p className="text-gray-600 mb-6">
            请配置 IdeaLab API 密钥
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="输入你的 IdeaLab API Key"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-2">
              获取方式：访问 IdeaLab 平台获取 API 密钥
            </p>
          </div>

          <button
            onClick={saveApiKey}
            className="btn-primary w-full"
          >
            保存并开始使用
          </button>
        </div>
      </div>
    );
  }

  // 主界面
  return (
    <div className="w-screen h-screen bg-gray-50 flex flex-col">
      {/* 标题栏 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐕</span>
          <h1 className="text-lg font-semibold text-gray-800">导盲犬</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              clearMessages();
            }}
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
            title="清空对话"
          >
            🗑️ 清空
          </button>
          <button
            onClick={() => {
              setTempApiKey(apiKey);
              setShowConfig(true);
            }}
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
            title="设置"
          >
            ⚙️ 设置
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <p className="text-sm text-red-600">❌ {error}</p>
        </div>
      )}

      {/* 消息列表 */}
      <MessageList />

      {/* 输入区域 */}
      <InputArea />
    </div>
  );
}

export default App;
