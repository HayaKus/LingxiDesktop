import React, { useState, useEffect, useRef } from 'react';

interface Session {
  id: string;
  name: string;
  messages: any[];
  status: 'idle' | 'running' | 'completed' | 'error';
  currentResponse: string;
  createdAt: number;
  updatedAt: number;
}

interface SessionHistoryProps {
  currentSessionId: string | null;
  onSessionSelect: (session: Session) => void;
  onNewSession: () => void;
}

export const SessionHistory: React.FC<SessionHistoryProps> = ({
  currentSessionId,
  onSessionSelect,
  onNewSession,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 加载会话列表
  const loadSessions = async () => {
    try {
      const allSessions = await window.electronAPI.sessionGetAll();
      // 过滤掉 0 条消息的会话，并按更新时间排序，只保留最新的 10 个
      const filtered = allSessions
        .filter(session => session.messages.length > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10); // 只保留最新的 10 个会话
      setSessions(filtered);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  // 初始加载
  useEffect(() => {
    loadSessions();
  }, []);

  // 当下拉菜单打开时重新加载
  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 删除会话
  const handleDelete = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm('确定要删除这个会话吗？')) {
      return;
    }

    try {
      await window.electronAPI.sessionDelete(sessionId);
      await loadSessions();
      
      // 如果删除的是当前会话，创建新会话
      if (sessionId === currentSessionId) {
        onNewSession();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // 小于1分钟
    if (diff < 60000) {
      return '刚刚';
    }
    
    // 小于1小时
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`;
    }
    
    // 小于1天
    if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}小时前`;
    }
    
    // 小于7天
    if (diff < 604800000) {
      return `${Math.floor(diff / 86400000)}天前`;
    }
    
    // 显示日期
    return date.toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* 历史按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        历史
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto z-50">
          {/* 新建会话按钮 */}
          <div className="p-2 border-b border-gray-200">
            <button
              onClick={() => {
                onNewSession();
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-sm text-left text-blue-600 hover:bg-blue-50 rounded-md transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新建会话
            </button>
          </div>

          {/* 会话列表 */}
          <div className="p-2">
            {sessions.length === 0 ? (
              <div className="px-3 py-8 text-center text-gray-400 text-sm">
                暂无历史会话
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => {
                    onSessionSelect(session);
                    setIsOpen(false);
                  }}
                  className={`
                    px-3 py-2 rounded-md cursor-pointer transition-colors group
                    ${session.id === currentSessionId 
                      ? 'bg-blue-50 text-blue-900' 
                      : 'hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* 会话名称 */}
                      <div className="text-sm font-medium truncate">
                        {session.name}
                      </div>
                      
                      {/* 消息数量和时间 */}
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>{session.messages.length} 条消息</span>
                        <span>•</span>
                        <span>{formatTime(session.updatedAt)}</span>
                      </div>
                      
                      {/* 状态标识 */}
                      {session.status === 'running' && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-blue-600">
                          <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                          运行中
                        </div>
                      )}
                    </div>

                    {/* 删除按钮 */}
                    <button
                      onClick={(e) => handleDelete(session.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                      title="删除会话"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
