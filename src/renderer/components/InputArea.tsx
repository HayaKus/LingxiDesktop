import React, { useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { generateId, formatError } from '../utils/helpers';
import { logger } from '../utils/logger';

interface InputAreaProps {
  currentSessionId: string | null;
}

export function InputArea({ currentSessionId }: InputAreaProps) {
  const [input, setInput] = useState('');
  const [includeScreenshot, setIncludeScreenshot] = useState(true); // 使用本地状态
  const [includeClipboard, setIncludeClipboard] = useState(true); // 使用本地状态
  const [autoUnselectImages, setAutoUnselectImages] = useState(true); // 配置：是否自动取消图片选项
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const noticeTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const getSessionState = useChatStore((state) => state.getSessionState);
  const addMessage = useChatStore((state) => state.addMessage);
  const setLoading = useChatStore((state) => state.setLoading);
  const setError = useChatStore((state) => state.setError);
  const contextTrimNotice = useChatStore((state) => state.contextTrimNotice);
  const setAutoClipboard = useChatStore((state) => state.setAutoClipboard);
  
  // 获取当前会话状态
  const sessionState = currentSessionId ? getSessionState(currentSessionId) : null;
  const messages = sessionState?.messages || [];
  const isLoading = sessionState?.isLoading || false;

  // 自动聚焦输入框
  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // 加载配置并默认勾选选项（只在组件挂载时执行一次）
  React.useEffect(() => {
    console.log('🔧 InputArea mounted, loading config and setting checkboxes to true');
    setIncludeScreenshot(true);
    setIncludeClipboard(true);
    setAutoClipboard(true);
    
    // 加载配置
    const loadConfig = async () => {
      try {
        const config = await window.electronAPI.getConfig();
        if (config?.autoUnselectImages !== undefined) {
          setAutoUnselectImages(config.autoUnselectImages);
          console.log('📋 Loaded autoUnselectImages config:', config.autoUnselectImages);
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };
    
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 空依赖数组，只在挂载时执行
  
  // 监听复选框状态变化
  React.useEffect(() => {
    console.log('📋 Checkbox states changed:', { includeScreenshot, includeClipboard });
  }, [includeScreenshot, includeClipboard]);

  // 监听completed事件，根据配置决定是否重置复选框
  React.useEffect(() => {
    if (!currentSessionId) return;
    
    const handleCompleted = () => {
      // 只有当配置为true时才自动取消勾选
      if (autoUnselectImages) {
        console.log('🎉 Received completed, autoUnselectImages=true, resetting checkboxes to false');
        setIncludeScreenshot(false);
        setIncludeClipboard(false);
      } else {
        console.log('🎉 Received completed, autoUnselectImages=false, keeping checkboxes unchanged');
      }
    };
    
    const handleSessionUpdate = (data: any) => {
      if (data.sessionId === currentSessionId && data.type === 'completed') {
        handleCompleted();
      }
    };
    
    window.electronAPI.onSessionUpdate(handleSessionUpdate);
    
    return () => {
      window.electronAPI.offSessionUpdate(handleSessionUpdate);
    };
  }, [currentSessionId, autoUnselectImages]);
  
  // 组件卸载时清理定时器
  React.useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !currentSessionId) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(currentSessionId, true);
    setError(currentSessionId, null);

    try {
      // 收集图片
      const screenshotImageUrls: string[] = [];
      const clipboardImageUrls: string[] = [];
      const allImageUrls: string[] = [];
      let totalImageCount = 0;

      // 收集窗口截图
      if (includeScreenshot) {
        try {
          const screenshot = await window.electronAPI.captureScreen();
          screenshotImageUrls.push(screenshot);
          allImageUrls.push(screenshot);
          totalImageCount++;
        } catch (error) {
          console.error('Screenshot failed:', error);
          setError(currentSessionId, '截图失败，请检查屏幕录制权限');
          setLoading(currentSessionId, false);
          return;
        }
      }

      // 收集剪贴板图片
      if (includeClipboard) {
        try {
          const clipboardImages = await window.electronAPI.readClipboardImage();
          console.log('📋 Clipboard images received:', clipboardImages?.length || 0);
          if (clipboardImages && Array.isArray(clipboardImages) && clipboardImages.length > 0) {
            clipboardImageUrls.push(...clipboardImages);
            allImageUrls.push(...clipboardImages);
            totalImageCount += clipboardImages.length;
            console.log('📋 Total clipboard images:', clipboardImageUrls.length);
          }
        } catch (error) {
          console.error('Read clipboard failed:', error);
        }
      }

      // 构建用户消息（不包含图片）
      const newUserMessage = {
        id: generateId(),
        role: 'user' as const,
        content: userMessage,
        timestamp: Date.now(),
      };

      // 添加到当前会话的 UI
      addMessage(currentSessionId, newUserMessage);

      // 如果有窗口截图，添加一条带图片的assistant消息
      if (screenshotImageUrls.length > 0) {
        addMessage(currentSessionId, {
          id: generateId(),
          role: 'assistant',
          content: '📸 我看到了你的屏幕：',
          imageUrls: screenshotImageUrls,
          timestamp: Date.now(),
        });
      }

      // 如果有粘贴板截图，添加一条带图片的assistant消息  
      if (clipboardImageUrls.length > 0) {
        addMessage(currentSessionId, {
          id: generateId(),
          role: 'assistant',
          content: '📋 我看到了你粘贴板中的截图：',
          clipboardImageUrls: clipboardImageUrls,
          timestamp: Date.now(),
        });
      }

      // 准备发送给主进程的消息列表（过滤掉 tool 消息和仅用于显示的图片消息）
      const sessionMessages = messages
        .filter(msg => {
          // 过滤掉 tool 消息
          if (msg.role === 'tool') return false;
          
          // 过滤掉仅用于显示图片的 assistant 消息（这些消息会被重新构建）
          if (msg.role === 'assistant' && (msg.imageUrls || msg.clipboardImageUrls)) {
            return false;
          }
          
          return true;
        })
        .map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content || '',
          imageUrls: msg.imageUrls,
          clipboardImageUrls: msg.clipboardImageUrls,
          timestamp: msg.timestamp,
        }));

      // 添加当前用户消息（只包含文本）
      sessionMessages.push({
        id: newUserMessage.id,
        role: newUserMessage.role,
        content: userMessage,
        imageUrls: undefined,
        clipboardImageUrls: undefined,
        timestamp: newUserMessage.timestamp,
      });
      
      // 如果有窗口截图，添加assistant消息（包含图片的多模态内容）
      if (screenshotImageUrls.length > 0) {
        sessionMessages.push({
          id: `screenshot-${Date.now()}`,
          role: 'user' as const,  // 改为user角色，这样AI才能看到
          content: [
            { type: 'text', text: '📸 我的屏幕：' },
            ...screenshotImageUrls.map(url => ({
              type: 'image_url',
              image_url: { url }
            }))
          ] as any,  // 多模态内容
          imageUrls: screenshotImageUrls,  // 保存URL用于历史记录
          clipboardImageUrls: undefined,
          timestamp: Date.now(),
        });
      }
      
      // 如果有粘贴板截图，添加assistant消息（包含图片的多模态内容）
      if (clipboardImageUrls.length > 0) {
        sessionMessages.push({
          id: `clipboard-${Date.now()}`,
          role: 'user' as const,  // 改为user角色，这样AI才能看到
          content: [
            { type: 'text', text: '📋 我粘贴板中的截图：' },
            ...clipboardImageUrls.map(url => ({
              type: 'image_url',
              image_url: { url }
            }))
          ] as any,  // 多模态内容
          imageUrls: undefined,
          clipboardImageUrls: clipboardImageUrls,  // 保存URL用于历史记录
          timestamp: Date.now(),
        });
      }

      // 发送到主进程处理
      await window.electronAPI.sessionStartAI(
        currentSessionId,
        sessionMessages,
        userMessage,
        totalImageCount
      );

      logger.info(`✅ 消息已发送到主进程，会话ID: ${currentSessionId}`);

      // 注意：不在这里取消勾选，而是在收到completed事件时取消
      // 这样可以保持按钮状态和复选框状态的一致性

    } catch (error: any) {
      console.error('Send message error:', error);
      setError(currentSessionId, formatError(error));
      setLoading(currentSessionId, false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 p-4 bg-white">
      {/* 上下文裁剪提示 */}
      {contextTrimNotice && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-center gap-2">
          <span>💡</span>
          <span>{contextTrimNotice}</span>
        </div>
      )}
      
      {/* 选项 */}
      <div className="flex gap-4 mb-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeScreenshot}
            onChange={(e) => setIncludeScreenshot(e.target.checked)}
            disabled={isLoading}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700">附带屏幕信息</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeClipboard}
            onChange={(e) => setIncludeClipboard(e.target.checked)}
            disabled={isLoading}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700">附带粘贴板图片</span>
        </label>
      </div>

      {/* 输入框 */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入你的问题..."
          disabled={isLoading}
          className="flex-1 input-field resize-none"
          rows={2}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="btn-primary self-end disabled:opacity-50 disabled:cursor-not-allowed"
        >
          发送
        </button>
      </div>
    </div>
  );
}
