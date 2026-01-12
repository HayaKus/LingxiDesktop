import { useEffect, useState } from 'react';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { useChatStore } from './store/chatStore';
import { aiService } from './utils/aiService';

interface UserInfo {
  workid: string;
  name: string;
  email: string;
  cname?: string;
  empId?: string;
  accountId?: number;
}

function App() {
  const [apiKey, setApiKey] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const [tempKnowledge, setTempKnowledge] = useState('');
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const error = useChatStore((state) => state.error);
  const clearMessages = useChatStore((state) => state.clearMessages);
  const autoClipboard = useChatStore((state) => state.autoClipboard);
  const setAutoClipboard = useChatStore((state) => state.setAutoClipboard);

  useEffect(() => {
    // 加载配置
    loadConfig();
    // 加载用户信息
    loadUserInfo();
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

  const loadUserInfo = async () => {
    try {
      const config = await window.electronAPI.getConfig();
      if (config?.userInfo) {
        setUserInfo(config.userInfo);
      }
    } catch (error) {
      console.error('Load user info failed:', error);
    }
  };

  const saveConfig = async () => {
    if (!tempApiKey.trim()) {
      alert('请输入 API Key');
      return;
    }

    try {
      await window.electronAPI.saveConfig({ 
        apiKey: tempApiKey,
        knowledge: tempKnowledge 
      });
      setApiKey(tempApiKey);
      setKnowledge(tempKnowledge);
      aiService.initialize(tempApiKey);
      useChatStore.getState().setKnowledge(tempKnowledge);
      setShowConfig(false);
      clearMessages();
    } catch (error) {
      console.error('Save config failed:', error);
      alert('保存配置失败');
    }
  };

  // 统一的设置界面
  if (showConfig) {
    return (
      <div className="w-screen h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            ⚙️ 设置
          </h1>
          <p className="text-gray-600 mb-6">
            配置应用参数
          </p>

          {/* API Key 配置 */}
          <div className="mb-6">
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

          {/* 背景知识配置 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📚 背景知识
            </label>
            <textarea
              value={tempKnowledge}
              onChange={(e) => setTempKnowledge(e.target.value)}
              placeholder="例如：我是一名前端工程师，主要使用React和TypeScript..."
              className="input-field resize-none"
              rows={8}
            />
            <p className="text-xs text-gray-500 mt-2">
              提示：可以包含你的角色、工作内容、常用技术栈、项目背景等信息
            </p>
          </div>

          {/* 自动复制配置 */}
          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoClipboard}
                onChange={(e) => setAutoClipboard(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700">
                将AI建议回答复制到粘贴板
              </span>
            </label>
            <p className="text-xs text-gray-500 mt-2 ml-6">
              开启后，AI回复中的建议内容会自动复制到粘贴板
            </p>
          </div>

          {/* 按钮 */}
          <div className="flex gap-2">
            <button
              onClick={saveConfig}
              className="btn-primary flex-1"
            >
              保存设置
            </button>
            {apiKey && (
              <button
                onClick={() => {
                  setTempApiKey(apiKey);
                  setTempKnowledge(knowledge);
                  setShowConfig(false);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              >
                取消
              </button>
            )}
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
          <h1 className="text-lg font-semibold text-gray-800">灵析</h1>
        </div>
        <div className="flex items-center gap-3">
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
              setTempKnowledge(knowledge);
              setShowConfig(true);
            }}
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
            title="设置"
          >
            ⚙️ 设置
          </button>
          
          {/* 用户头像 */}
          {userInfo && (
            <div className="relative group">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm cursor-pointer hover:shadow-lg transition-shadow">
                {userInfo.name.charAt(0)}
              </div>
              
              {/* 悬停显示用户信息 */}
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold">
                    {userInfo.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      {userInfo.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {userInfo.workid}
                    </div>
                  </div>
                </div>
                {userInfo.cname && (
                  <div className="text-xs text-gray-600 mb-1">
                    {userInfo.cname}
                  </div>
                )}
                <div className="text-xs text-gray-500 truncate">
                  {userInfo.email}
                </div>
              </div>
            </div>
          )}
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
