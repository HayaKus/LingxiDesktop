import { useEffect, useState } from 'react';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { useChatStore } from './store/chatStore';
import { aiService } from './utils/aiService';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const [tempKnowledge, setTempKnowledge] = useState('');
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
      // 加载知识
      if (config?.knowledge) {
        setKnowledge(config.knowledge);
        useChatStore.getState().setKnowledge(config.knowledge);
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

  const saveKnowledge = async () => {
    try {
      await window.electronAPI.saveConfig({ knowledge: tempKnowledge });
      setKnowledge(tempKnowledge);
      setShowKnowledge(false);
      // 更新 store 中的知识
      useChatStore.getState().setKnowledge(tempKnowledge);
    } catch (error) {
      console.error('Save knowledge failed:', error);
      alert('保存知识失败');
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

  // 知识管理界面
  if (showKnowledge) {
    return (
      <div className="w-screen h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl w-full">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            📚 背景知识
          </h1>
          <p className="text-gray-600 mb-6">
            填写AI需要了解的背景知识，这些信息会在每次对话中提供给AI
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              背景知识
            </label>
            <textarea
              value={tempKnowledge}
              onChange={(e) => setTempKnowledge(e.target.value)}
              placeholder="例如：我是一名前端工程师，主要使用React和TypeScript..."
              className="input-field resize-none"
              rows={10}
            />
            <p className="text-xs text-gray-500 mt-2">
              提示：可以包含你的角色、工作内容、常用技术栈、项目背景等信息
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={saveKnowledge}
              className="btn-primary flex-1"
            >
              保存
            </button>
            <button
              onClick={() => {
                setTempKnowledge(knowledge);
                setShowKnowledge(false);
              }}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            >
              取消
            </button>
          </div>
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
              setTempKnowledge(knowledge);
              setShowKnowledge(true);
            }}
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
            title="知识"
          >
            📚 知识
          </button>
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
