import { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';
import { useChatStore } from '../store/chatStore';

interface MessageListProps {
  sessionId: string | null;
}

export function MessageList({ sessionId }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // 优化：只订阅当前会话的状态，避免其他会话变化导致重渲染
  const messages = useChatStore((state) => 
    sessionId && state.sessions[sessionId] ? state.sessions[sessionId].messages : []
  );
  const isLoading = useChatStore((state) => 
    sessionId && state.sessions[sessionId] ? state.sessions[sessionId].isLoading : false
  );

  // 自动滚动到底部
  // 1. 消息数量变化时滚动
  // 2. 流式返回时也要滚动（监听最后一条消息的内容变化）
  const messageCount = messages.length;
  const lastMessageContent = messages.length > 0 ? messages[messages.length - 1].content : '';
  
  useEffect(() => {
    if (messageCount > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messageCount, lastMessageContent]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-gray-400">
          <div className="text-6xl mb-4">🐕</div>
          <p className="text-lg mb-2">你好！我是灵析</p>
          <p className="text-sm">你可以问我任何问题</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 min-h-0">
      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}

      {/* 加载指示器 */}
      {isLoading && (
        <div className="flex justify-start mb-4">
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
              <span className="text-sm text-gray-500">思考中...</span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
