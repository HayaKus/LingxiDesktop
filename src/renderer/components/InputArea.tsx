import React, { useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { aiService } from '../utils/aiService';
import { generateId, convertToChatMessage, formatError } from '../utils/helpers';
import { intelligentContextManagement } from '../utils/contextManager';
import { logger } from '../utils/logger';

// 提取AI建议回复的内容
// 匹配系统提示词中要求的标准格式：建议回复："xxx"
function extractSuggestedReply(aiResponse: string): string | null {
  const pattern = /建议回复[：:]\s*["""']([^"""']+)["""']/i;
  const match = aiResponse.match(pattern);
  
  if (match && match[1]) {
    return match[1].trim();
  }

  return null;
}

export function InputArea() {
  const [input, setInput] = useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const noticeTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const {
    messages,
    isLoading,
    includeScreenshot,
    includeClipboard,
    autoClipboard,
    knowledge,
    contextTrimNotice,
    addMessage,
    updateLastMessage,
    setLoading,
    setError,
    setIncludeScreenshot,
    setIncludeClipboard,
    setAutoClipboard,
    setContextTrimNotice,
  } = useChatStore();

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
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);
    setError(null);

    try {
      // 分别收集窗口截图和粘贴板截图
      const screenshotImageUrls: string[] = [];
      const clipboardImageUrls: string[] = [];
      const allImageUrls: string[] = [];

      // 收集窗口截图（不显示给用户，但发送给AI）
      if (includeScreenshot) {
        try {
          const screenshot = await window.electronAPI.captureScreen();
          screenshotImageUrls.push(screenshot);
          allImageUrls.push(screenshot);
        } catch (error) {
          console.error('Screenshot failed:', error);
          setError('截图失败，请检查屏幕录制权限');
          setLoading(false);
          return;
        }
      }

      // 收集剪贴板图片（显示给用户）- 现在返回历史中的所有图片
      if (includeClipboard) {
        try {
          const clipboardImages = await window.electronAPI.readClipboardImage();
          console.log('📋 Clipboard images received:', clipboardImages);
          
          // 兼容处理：可能返回数组或空数组
          if (clipboardImages && Array.isArray(clipboardImages) && clipboardImages.length > 0) {
            console.log(`✅ Found ${clipboardImages.length} clipboard images`);
            clipboardImageUrls.push(...clipboardImages);
            allImageUrls.push(...clipboardImages);
          } else {
            console.log('ℹ️ No clipboard images in history');
          }
          // 如果剪贴板没有图片，静默跳过，不报错
        } catch (error) {
          console.error('❌ Read clipboard failed:', error);
          // 读取失败也不报错，静默跳过
        }
      }

      // 添加用户消息（不包含任何图片显示）
      const newUserMessage = {
        id: generateId(),
        role: 'user' as const,
        content: userMessage,
        imageUrls: allImageUrls.length > 0 ? allImageUrls : undefined,  // 发送给AI的所有图片
        timestamp: Date.now(),
      };
      addMessage(newUserMessage);

      // 如果有粘贴板截图，添加一条AI消息来显示（让它看起来像AI看到了粘贴板）
      if (clipboardImageUrls.length > 0) {
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: '📋 我看到了你粘贴板中的截图：',
          clipboardImageUrls: clipboardImageUrls,
          timestamp: Date.now(),
        });
      }

      // ✅ 智能上下文管理：动态裁剪历史消息
      logger.info('🔄 开始上下文管理...');
      const { trimmedMessages, stats } = intelligentContextManagement(
        messages,
        newUserMessage,
        knowledge
      );
      
      // 上下文裁剪提示
      if (stats.removedCount > 0 || stats.imagesRemoved > 0) {
        logger.info('📊 上下文优化统计：', {
          originalCount: stats.originalCount,
          originalTokens: stats.originalTokens,
          trimmedCount: stats.trimmedCount,
          trimmedTokens: stats.trimmedTokens,
          removedCount: stats.removedCount,
          imagesRemoved: stats.imagesRemoved,
          targetTokens: stats.targetTokens,
          usageRate: `${((stats.trimmedTokens / stats.targetTokens) * 100).toFixed(1)}%`,
        });
        
        // 清除之前的定时器
        if (noticeTimerRef.current) {
          clearTimeout(noticeTimerRef.current);
        }
        
        // 构建提示信息
        let notice = '已自动优化对话上下文：';
        if (stats.imagesRemoved > 0 && stats.removedCount === 0) {
          // 只移除了图片
          notice += `移除 ${stats.imagesRemoved} 张旧图片，保留最新图片和所有文字`;
        } else if (stats.imagesRemoved > 0 && stats.removedCount > 0) {
          // 既移除了图片又移除了消息
          notice += `移除 ${stats.imagesRemoved} 张旧图片和 ${stats.removedCount} 条旧消息，保留最近 ${stats.trimmedCount} 条`;
        } else {
          // 只移除了消息
          notice += `保留最近 ${stats.trimmedCount} 条消息，移除较早的 ${stats.removedCount} 条消息`;
        }
        
        // 设置系统提示（不作为对话消息）
        setContextTrimNotice(notice);
        
        // 5秒后自动清除提示
        noticeTimerRef.current = setTimeout(() => {
          setContextTrimNotice(null);
          noticeTimerRef.current = null;
        }, 5000);
      }
      
      // 准备 AI 请求 - 使用裁剪后的历史消息
      const chatMessages = trimmedMessages
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
      try {
        for await (const chunk of aiService.chat(chatMessages, knowledge, (error) => {
          console.error('💥 AI Service 回调错误：', error);
          setError(formatError(error));
        })) {
          fullResponse += chunk;
          updateLastMessage(fullResponse);
        }
      } catch (streamError: any) {
        console.error('💥 流式响应错误：', streamError);
        console.error('   错误详情：', {
          name: streamError.name,
          message: streamError.message,
          stack: streamError.stack,
          ...streamError
        });
        throw streamError;
      }

      // 如果开启了自动复制到粘贴板，智能提取AI建议的回复内容
      if (autoClipboard && fullResponse) {
        const suggestedReply = extractSuggestedReply(fullResponse);
        if (suggestedReply) {
          try {
            await navigator.clipboard.writeText(suggestedReply);
            console.log('✅ 已提取建议回复并复制到粘贴板:', suggestedReply);
          } catch (error) {
            console.error('复制到粘贴板失败:', error);
            // 复制失败不影响主流程，静默处理
          }
        } else {
          console.log('ℹ️ AI回复中未找到建议回复内容');
        }
      }

      // ✅ AI回复完成后，自动取消勾选截图选项，避免重复发送相同截图
      setIncludeScreenshot(false);
      setIncludeClipboard(false);

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
