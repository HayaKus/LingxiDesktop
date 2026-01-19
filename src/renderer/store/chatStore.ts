import { create } from 'zustand';
import { Message } from '../../types';
import { generateSessionId, reportConversation, calculateConversationTokens } from '../utils/analytics';

// 每个会话的状态
interface SessionState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  currentUserMessage: string;
  currentImageCount: number;
}

interface ChatState {
  // 全局配置
  includeScreenshot: boolean;
  includeClipboard: boolean;
  autoClipboard: boolean;
  knowledge: string;
  contextTrimNotice: string | null;
  sessionId: string; // 用于数据上报的 Session ID
  
  // 多会话状态：key 是会话 ID，value 是会话状态
  sessions: Record<string, SessionState>;
  currentSessionId: string | null; // 当前激活的会话 ID
  
  // Actions
  setCurrentSession: (sessionId: string) => void; // 切换当前会话
  getSessionState: (sessionId: string) => SessionState; // 获取会话状态
  addMessage: (sessionId: string, message: Message) => void;
  updateAssistantMessage: (sessionId: string, content: string, toolCalls?: any[]) => void;
  loadMessages: (sessionId: string, messages: Message[]) => void;
  clearMessages: (sessionId: string) => void;
  setLoading: (sessionId: string, loading: boolean) => void;
  setError: (sessionId: string, error: string | null) => void;
  setIncludeScreenshot: (include: boolean) => void;
  setIncludeClipboard: (include: boolean) => void;
  setAutoClipboard: (auto: boolean) => void;
  setKnowledge: (knowledge: string) => void;
  setContextTrimNotice: (notice: string | null) => void;
  initSession: () => void;
  setCurrentUserMessage: (sessionId: string, message: string) => void;
  setCurrentImageCount: (sessionId: string, count: number) => void;
  reportCurrentConversation: (
    sessionId: string,
    assistantMessage: string,
    actualUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  ) => Promise<void>;
}

// 创建默认会话状态
const createDefaultSessionState = (): SessionState => ({
  messages: [],
  isLoading: false,
  error: null,
  currentUserMessage: '',
  currentImageCount: 0,
});

export const useChatStore = create<ChatState>((set, get) => ({
  // 全局配置
  includeScreenshot: false,
  includeClipboard: false,
  autoClipboard: true,
  knowledge: '',
  contextTrimNotice: null,
  sessionId: generateSessionId(),
  
  // 多会话状态
  sessions: {},
  currentSessionId: null,
  
  // 切换当前会话
  setCurrentSession: (sessionId) =>
    set({
      currentSessionId: sessionId,
    }),
  
  // 获取会话状态（如果不存在则创建）
  getSessionState: (sessionId) => {
    const state = get();
    if (!state.sessions[sessionId]) {
      set((state) => ({
        sessions: {
          ...state.sessions,
          [sessionId]: createDefaultSessionState(),
        },
      }));
    }
    return get().sessions[sessionId] || createDefaultSessionState();
  },
  
  // 添加消息
  addMessage: (sessionId, message) =>
    set((state) => {
      const currentSession = state.sessions[sessionId] || createDefaultSessionState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            messages: [...currentSession.messages, message],
          },
        },
      };
    }),
  
  // 更新助手消息 - 只更新最后一个内容为空的assistant消息，或创建新的
  updateAssistantMessage: (sessionId, content, toolCalls) =>
    set((state) => {
      const currentSession = state.sessions[sessionId] || createDefaultSessionState();
      const messages = [...currentSession.messages];
      
      // 从后往前找最后一个内容为空或只有少量内容的assistant消息（正在流式更新的消息）
      let targetIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role === 'assistant' && 
            !msg.imageUrls && 
            !msg.clipboardImageUrls &&
            (!msg.content || msg.content.length < content.length)) {
          targetIndex = i;
          break;
        }
      }
      
      if (targetIndex !== -1) {
        // 更新找到的消息（流式更新）
        messages[targetIndex] = {
          ...messages[targetIndex],
          content,
          ...(toolCalls && { tool_calls: toolCalls }),
        } as any;
      } else {
        // 没有找到正在更新的消息，创建新的
        messages.push({
          id: `msg-${Date.now()}`,
          role: 'assistant' as const,
          content,
          timestamp: Date.now(),
          ...(toolCalls && { tool_calls: toolCalls }),
        } as any);
      }
      
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            messages,
          },
        },
      };
    }),
  
  // 加载消息
  loadMessages: (sessionId, messages) =>
    set((state) => {
      const currentSession = state.sessions[sessionId] || createDefaultSessionState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            messages: [...messages],
            error: null,
          },
        },
      };
    }),
  
  // 清空消息
  clearMessages: (sessionId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: createDefaultSessionState(),
      },
    })),
  
  // 设置加载状态
  setLoading: (sessionId, loading) =>
    set((state) => {
      const currentSession = state.sessions[sessionId] || createDefaultSessionState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            isLoading: loading,
          },
        },
      };
    }),
  
  // 设置错误
  setError: (sessionId, error) =>
    set((state) => {
      const currentSession = state.sessions[sessionId] || createDefaultSessionState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            error,
            isLoading: false,
          },
        },
      };
    }),
  
  // 全局配置
  setIncludeScreenshot: (include) =>
    set({
      includeScreenshot: include,
    }),
  
  setIncludeClipboard: (include) =>
    set({
      includeClipboard: include,
    }),
  
  setAutoClipboard: (auto) =>
    set({
      autoClipboard: auto,
    }),
  
  setKnowledge: (knowledge) =>
    set({
      knowledge,
    }),
  
  setContextTrimNotice: (notice) =>
    set({
      contextTrimNotice: notice,
    }),
  
  initSession: () =>
    set({
      sessionId: generateSessionId(),
    }),
  
  setCurrentUserMessage: (sessionId, message) =>
    set((state) => {
      const currentSession = state.sessions[sessionId] || createDefaultSessionState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            currentUserMessage: message,
          },
        },
      };
    }),
  
  setCurrentImageCount: (sessionId, count) =>
    set((state) => {
      const currentSession = state.sessions[sessionId] || createDefaultSessionState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            currentImageCount: count,
          },
        },
      };
    }),
  
  reportCurrentConversation: async (sessionId, assistantMessage, actualUsage) => {
    const state = get();
    const sessionState = state.getSessionState(sessionId);
    
    // 获取用户信息
    const userInfo = await window.electronAPI.getUserInfo();
    if (!userInfo) {
      console.warn('无法获取用户信息，跳过数据上报');
      return;
    }

    // 优先使用 API 返回的实际 token，如果没有则使用估算值
    let tokens: number;
    if (actualUsage) {
      tokens = actualUsage.total_tokens;
      console.log('✅ 使用 API 返回的实际 token:', tokens);
    } else {
      tokens = calculateConversationTokens(
        sessionState.currentUserMessage,
        assistantMessage,
        sessionState.currentImageCount
      );
      console.log('⚠️ API 未返回 token，使用估算值:', tokens);
    }

    // 异步上报数据
    await reportConversation({
      staffName: userInfo.name,
      staffId: userInfo.workid,
      traceId: state.sessionId,
      token: tokens,
    });

    // 清空当前用户消息和图片计数
    set((state) => {
      const currentSession = state.sessions[sessionId] || createDefaultSessionState();
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...currentSession,
            currentUserMessage: '',
            currentImageCount: 0,
          },
        },
      };
    });
  },
}));