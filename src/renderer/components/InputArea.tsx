import React, { useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { generateId, formatError } from '../utils/helpers';
import { logger } from '../utils/logger';

interface InputAreaProps {
  currentSessionId: string | null;
}

export function InputArea({ currentSessionId }: InputAreaProps) {
  const [input, setInput] = useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const noticeTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const getSessionState = useChatStore((state) => state.getSessionState);
  const addMessage = useChatStore((state) => state.addMessage);
  const setLoading = useChatStore((state) => state.setLoading);
  const setError = useChatStore((state) => state.setError);
  const includeScreenshot = useChatStore((state) => state.includeScreenshot);
  const includeClipboard = useChatStore((state) => state.includeClipboard);
  const contextTrimNotice = useChatStore((state) => state.contextTrimNotice);
  const setIncludeScreenshot = useChatStore((state) => state.setIncludeScreenshot);
  const setIncludeClipboard = useChatStore((state) => state.setIncludeClipboard);
  const setAutoClipboard = useChatStore((state) => state.setAutoClipboard);
  
  // 获取当前会话状态
  const sessionState = currentSessionId ? getSessionState(currentSessionId) : null;
  const messages = sessionState?.messages || [];
  const isLoading = sessionState?.isLoading || false;

  // 自动聚焦输入框
  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // 默认勾选选项
  React.useEffect(() => {
    setIncludeScreenshot(true);
    setIncludeClipboard(true);
    setAutoClipboard(true);
  }, [setIncludeScreenshot, setIncludeClipboard, setAutoClipboard]);

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
          if (clipboardImages && Array.isArray(clipboardImages) && clipboardImages.length > 0) {
            clipboardImageUrls.push(...clipboardImages);
            allImageUrls.push(...clipboardImages);
            totalImageCount += clipboardImages.length;
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
          content: '📸 我看到了你的屏幕截图：',
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

      // 构建消息内容（用于发送给主进程）
      let messageContent: any = userMessage;
      
      // 如果有图片，构建多模态内容
      if (allImageUrls.length > 0) {
        messageContent = [
          { type: 'text', text: userMessage },
          ...allImageUrls.map(url => ({
            type: 'image_url',
            image_url: { url }
          }))
        ];
      }

      // 准备发送给主进程的消息列表（过滤掉 tool 消息）
      const sessionMessages = messages
        .filter(msg => msg.role !== 'tool')
        .map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content || '',
          imageUrls: msg.imageUrls,
          clipboardImageUrls: msg.clipboardImageUrls,
          timestamp: msg.timestamp,
        }));

      // 添加当前用户消息
      sessionMessages.push({
        id: newUserMessage.id,
        role: newUserMessage.role,
        content: messageContent,
        imageUrls: undefined,
        clipboardImageUrls: undefined,
        timestamp: newUserMessage.timestamp,
      });

      // 发送到主进程处理
      await window.electronAPI.sessionStartAI(
        currentSessionId,
        sessionMessages,
        userMessage,
        totalImageCount
      );

      logger.info(`✅ 消息已发送到主进程，会话ID: ${currentSessionId}`);

      // 自动取消勾选截图选项
      setIncludeScreenshot(false);
      setIncludeClipboard(false);

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
          {isLoading ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  );
}