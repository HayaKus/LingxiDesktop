import React, { useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { aiService } from '../utils/aiService';
import { generateId, convertToChatMessage, formatError } from '../utils/helpers';

export function InputArea() {
  const [input, setInput] = useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const {
    messages,
    isLoading,
    includeScreenshot,
    includeClipboard,
    addMessage,
    updateLastMessage,
    setLoading,
    setError,
    setIncludeScreenshot,
    setIncludeClipboard,
  } = useChatStore();

  // 自动聚焦输入框
  React.useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // 默认勾选两个选项
  React.useEffect(() => {
    setIncludeScreenshot(true);
    setIncludeClipboard(true);
  }, [setIncludeScreenshot, setIncludeClipboard]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // 收集图片（支持多张）
      const imageUrls: string[] = [];

      // 收集截图
      if (includeScreenshot) {
        try {
          const screenshot = await window.electronAPI.captureScreen();
          imageUrls.push(screenshot);
        } catch (error) {
          console.error('Screenshot failed:', error);
          setError('截图失败，请检查屏幕录制权限');
          setLoading(false);
          return;
        }
      }

      // 收集剪贴板图片（如果没有图片就跳过，不报错）
      if (includeClipboard) {
        try {
          const clipboardImage = await window.electronAPI.readClipboardImage();
          if (clipboardImage) {
            imageUrls.push(clipboardImage);
          }
          // 如果剪贴板没有图片，静默跳过，不报错
        } catch (error) {
          console.error('Read clipboard failed:', error);
          // 读取失败也不报错，静默跳过
        }
      }

      // 添加用户消息
      const newUserMessage = {
        id: generateId(),
        role: 'user' as const,
        content: userMessage,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
        timestamp: Date.now(),
      };
      addMessage(newUserMessage);

      // 准备 AI 请求
      const chatMessages = messages
        .slice(-10) // 只保留最近10条
        .map(convertToChatMessage);
      chatMessages.push(convertToChatMessage(newUserMessage));

      // 添加 AI 消息占位符
      const aiMessageId = generateId();
      addMessage({
        id: aiMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      });

      // 流式接收 AI 响应
      let fullResponse = '';
      for await (const chunk of aiService.chat(chatMessages, (error) => {
        setError(formatError(error));
      })) {
        fullResponse += chunk;
        updateLastMessage(fullResponse);
      }

      setLoading(false);
    } catch (error: any) {
      console.error('Send message error:', error);
      setError(formatError(error));
      setLoading(false);
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
      {/* 选项 */}
      <div className="flex gap-4 mb-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeScreenshot}
            onChange={(e) => setIncludeScreenshot(e.target.checked)}
            disabled={isLoading}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700">📷 包含当前屏幕</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeClipboard}
            onChange={(e) => setIncludeClipboard(e.target.checked)}
            disabled={isLoading}
            className="w-4 h-4"
          />
          <span className="text-sm text-gray-700">📋 粘贴板截图</span>
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
