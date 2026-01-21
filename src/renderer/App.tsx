import { useEffect, useState } from 'react';
import { MessageList } from './components/MessageList';
import { InputArea } from './components/InputArea';
import { SessionHistory } from './components/SessionHistory';
import { CommandTest } from './components/CommandTest';
import { McpConfig } from './components/McpConfig';
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
  // 默认 API KEY
  const DEFAULT_API_KEY = '068b1d567193bf0441113306afbc5c77';
  
  const [apiKey, setApiKey] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [knowledge, setKnowledge] = useState('');
  const [tempKnowledge, setTempKnowledge] = useState('');
  const [shortcut, setShortcut] = useState('CommandOrControl+Shift+0');
  const [tempShortcut, setTempShortcut] = useState('CommandOrControl+Shift+0');
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showCommandTest, setShowCommandTest] = useState(false);
  const [showMcpConfig, setShowMcpConfig] = useState(false);
  // 优化：使用 useCallback 包装函数，避免每次都创建新函数
  const setCurrentSession = useChatStore((state) => state.setCurrentSession);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const autoClipboard = useChatStore((state) => state.autoClipboard);
  const setAutoClipboard = useChatStore((state) => state.setAutoClipboard);
  const initSession = useChatStore((state) => state.initSession);
  
  // 优化：只订阅当前会话的错误状态
  const error = useChatStore((state) => 
    currentSessionId && state.sessions[currentSessionId] 
      ? state.sessions[currentSessionId].error 
      : null
  );

  useEffect(() => {
    // 初始化会话（生成 Session ID）
    initSession();
    // 加载配置
    loadConfig();
    // 加载用户信息
    loadUserInfo();
    // 只在首次加载时创建新会话
    if (!currentSessionId) {
      createNewSession();
    }
    
    // 监听MCP日志
    const handleMcpLog = (data: { message: string; level: 'log' | 'error' | 'warn'; timestamp: string }) => {
      if (data.level === 'error') {
        console.error(`[MCP ${data.timestamp}]`, data.message);
      } else if (data.level === 'warn') {
        console.warn(`[MCP ${data.timestamp}]`, data.message);
      } else {
        console.log(`[MCP ${data.timestamp}]`, data.message);
      }
    };
    
    // 注册监听器
    window.electronAPI?.onMcpLog?.(handleMcpLog);
    
    return () => {
      // 清理监听器（如果有提供off方法）
      window.electronAPI?.offMcpLog?.(handleMcpLog);
    };
  }, []); // 只在组件挂载时执行一次

  // 单独监听会话更新
  useEffect(() => {
    if (!currentSessionId) return;
    
    const handleSessionUpdate = (data: any) => {
      // 只对重要事件打印日志，chunk事件太频繁不打印
      if (data.type !== 'chunk') {
        console.log('Session update:', data.type, 'sessionId:', data.sessionId);
      }
      
      // 严格检查：只处理当前会话的更新
      if (data.sessionId !== currentSessionId) {
        return;
      }
      
      if (data.type === 'model-downgrade') {
        // 模型降级通知
        console.warn(`⚠️ ${data.message}`);
        // 在界面显示降级通知（添加一条系统消息）
        useChatStore.getState().addMessage(currentSessionId, {
          id: `system-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${data.message}`,
          timestamp: Date.now(),
        });
      } else if (data.type === 'tool-executing') {
        // 工具开始执行
        console.log('🔧 Tool executing:', data.toolName, data.command, data.args);
        useChatStore.getState().addToolExecution(currentSessionId, {
          id: data.toolCallId,
          command: data.command,
          args: data.args,
          status: 'executing',
          result: null,
        });
      } else if (data.type === 'tool-completed') {
        // 工具执行完成
        console.log('✅ Tool completed:', data.toolName, data.status);
        useChatStore.getState().updateToolExecution(currentSessionId, data.toolCallId, {
          status: data.status,
          result: data.result,
        });
      } else if (data.type === 'chunk') {
        // 更新 AI 回复
        useChatStore.getState().updateAssistantMessage(currentSessionId, data.content, data.tool_calls);
      } else if (data.type === 'completed') {
        // 完成
        console.log('🎉 Received completed event, updating UI states...');
        useChatStore.getState().setLoading(currentSessionId, false);
        
        // AI回复完成后，自动取消勾选截图和粘贴板选项
        // 这样可以保持按钮状态（发送/取消）和复选框状态的一致性
        console.log('📋 Unchecking screenshot and clipboard options...');
        useChatStore.getState().setIncludeScreenshot(false);
        useChatStore.getState().setIncludeClipboard(false);
        console.log('✅ UI states updated');
        
        // 显示数据上报日志
        if (data.usage) {
          console.log('✅ 消息已发送到主进程，会话ID:', currentSessionId);
          console.log('💰 使用 API 返回的实际 token:', data.usage.total_tokens);
          console.log('📊 详细信息:', {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens
          });
          console.log('📊 主进程正在上报数据到后台...');
        } else {
          console.log('⚠️ API 未返回 token 信息，主进程将使用估算值');
        }
      } else if (data.type === 'reported') {
        // 数据上报完成
        console.log('✅ 数据上报成功！');
        if (data.reportResult) {
          console.log('   上报结果:', data.reportResult);
        }
      } else if (data.type === 'report-failed') {
        // 数据上报失败
        console.error('❌ 数据上报失败:', data.error);
      } else if (data.type === 'error') {
        // 错误
        useChatStore.getState().setError(currentSessionId, data.error);
        useChatStore.getState().setLoading(currentSessionId, false);
      }
    };
    
    window.electronAPI.onSessionUpdate(handleSessionUpdate);
    
    return () => {
      window.electronAPI.offSessionUpdate(handleSessionUpdate);
    };
  }, [currentSessionId]);

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
      // 加载快捷键
      if (config?.shortcut) {
        setShortcut(config.shortcut);
        setTempShortcut(config.shortcut);
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
    // 默认 API KEY
    const DEFAULT_API_KEY = '068b1d567193bf0441113306afbc5c77';
    
    // 如果不填则使用默认值
    const finalApiKey = tempApiKey.trim() || DEFAULT_API_KEY;

    try {
      await window.electronAPI.saveConfig({ 
        apiKey: finalApiKey,
        knowledge: tempKnowledge,
        shortcut: tempShortcut
      });
      setApiKey(finalApiKey);
      setKnowledge(tempKnowledge);
      setShortcut(tempShortcut);
      aiService.initialize(finalApiKey);
      useChatStore.getState().setKnowledge(tempKnowledge);
      setShowConfig(false);
      // 创建新会话（会自动清空）
      createNewSession();
    } catch (error) {
      console.error('Save config failed:', error);
      alert('保存配置失败');
    }
  };

  // 创建新会话
  const createNewSession = async () => {
    try {
      const session = await window.electronAPI.sessionCreate();
      // 切换到新会话（会自动创建空状态）
      setCurrentSessionId(session.id);
      setCurrentSession(session.id);
      console.log('New session created:', session.id);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  // 选择会话
  const handleSessionSelect = async (session: any) => {
    try {
      setCurrentSessionId(session.id);
      
      // 加载会话消息到 UI
      const messages = session.messages.map((msg: any) => {
        // 处理 content：如果是数组（多模态），提取文本部分
        let content = msg.content;
        if (Array.isArray(content)) {
          // 多模态内容，提取文本
          const textPart = content.find((part: any) => part.type === 'text');
          content = textPart ? textPart.text : '';
        }
        
        return {
          id: msg.id,
          role: msg.role,
          content: content, // 确保是字符串
          imageUrls: msg.imageUrls,
          clipboardImageUrls: msg.clipboardImageUrls,
          timestamp: msg.timestamp,
        };
      });
      
      loadMessages(session.id, messages);
      setCurrentSession(session.id);
      console.log('Session loaded:', session.id);
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  // 统一的设置界面
  if (showConfig) {
    return (
      <>
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
              placeholder="不填则默认使用比赛专用AK，有效期至2026年2月14日"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-2">
              不填则默认使用比赛专用AK，有效期至2026年2月14日
            </p>
          </div>

          {/* 快捷键配置 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ⌨️ 唤起快捷键
            </label>
            <input
              type="text"
              value={tempShortcut}
              onChange={(e) => setTempShortcut(e.target.value)}
              placeholder="例如：CommandOrControl+Shift+0"
              className="input-field"
            />
            <p className="text-xs text-gray-500 mt-2">
              提示：使用 Electron 快捷键格式，例如 CommandOrControl+Shift+0（Mac 上是 Cmd+Shift+0，Windows 上是 Ctrl+Shift+0）
            </p>
            <p className="text-xs text-gray-400 mt-1">
              当前快捷键：<code className="bg-gray-100 px-1 py-0.5 rounded">{shortcut}</code>
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

          {/* MCP服务器配置 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">
                📡 MCP 服务器
              </label>
              <button
                onClick={() => setShowMcpConfig(true)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                管理服务器 →
              </button>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded p-3">
              <p className="text-xs text-gray-600 mb-2">
                MCP（Model Context Protocol）允许AI使用外部工具和服务
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>🔧</span>
                <span>支持 HTTP 和 SSE 协议</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                <span>🌐</span>
                <span>可连接本地或远程MCP服务器</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              提示：通过浏览器控制台使用 <code className="bg-gray-100 px-1 rounded">window.electronAPI.mcp*</code> API配置
            </p>
          </div>

          {/* 命令测试 */}
          <div className="mb-6">
            <button
              onClick={() => {
                setShowConfig(false);
                setShowCommandTest(true);
              }}
              className="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 flex items-center justify-center gap-2"
            >
              <span>🧪</span>
              <span>命令测试</span>
            </button>
            <p className="text-xs text-gray-500 mt-2">
              测试命令执行功能
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
                  // 只有当 API KEY 不是默认值时才显示在输入框中
                  setTempApiKey(apiKey === DEFAULT_API_KEY ? '' : apiKey);
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
      
      {/* MCP配置弹窗 */}
      {showMcpConfig && <McpConfig onClose={() => setShowMcpConfig(false)} />}
      </>
    );
  }

  // 主界面
  return (
    <div className="w-full h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* 标题栏 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐕</span>
          <h1 className="text-lg font-semibold text-gray-800">灵析</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* 历史会话 */}
          <SessionHistory
            currentSessionId={currentSessionId}
            onSessionSelect={handleSessionSelect}
            onNewSession={createNewSession}
          />
          
          <button
            onClick={() => {
              // 只有当 API KEY 不是默认值时才显示在输入框中
              setTempApiKey(apiKey === DEFAULT_API_KEY ? '' : apiKey);
              setTempKnowledge(knowledge);
              setTempShortcut(shortcut);
              setShowConfig(true);
            }}
            className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 rounded hover:bg-gray-100"
            title="更多"
          >
            ⚙️ 更多
          </button>
          
          {/* 用户头像 */}
          {userInfo && (
            <div className="relative group">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm cursor-pointer hover:shadow-lg transition-shadow">
                {userInfo.name.charAt(0)}
              </div>
              
              {/* 悬停显示用户信息 */}
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="flex items-center gap-2">
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
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="text-red-600 text-lg">❌</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800 mb-1">
                AI 请求失败
              </p>
              <p className="text-sm text-red-600">
                {error.includes('api key') || error.includes('API key') || error.includes('无效') 
                  ? '❗ API Key 无效，请检查您的配置。如果您使用的是自定义 API Key，请确保它是正确的。您也可以删除 API Key 使用默认值。'
                  : error}
              </p>
              <button
                onClick={() => {
                  setTempApiKey(apiKey === DEFAULT_API_KEY ? '' : apiKey);
                  setTempKnowledge(knowledge);
                  setShowConfig(true);
                }}
                className="mt-2 text-xs text-red-700 hover:text-red-900 underline"
              >
                前往设置检查 API Key →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 命令测试界面 */}
      {showCommandTest ? (
        <div className="flex-1 overflow-y-auto p-4">
          <CommandTest onBack={() => setShowCommandTest(false)} />
        </div>
      ) : (
        <>
          {/* 消息列表 */}
          <MessageList sessionId={currentSessionId} />

          {/* 输入区域 */}
          <InputArea currentSessionId={currentSessionId} />
        </>
      )}
      
      {/* MCP配置弹窗 */}
      {showMcpConfig && <McpConfig onClose={() => setShowMcpConfig(false)} />}
    </div>
  );
}

export default App;
