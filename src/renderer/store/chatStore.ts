import { create } from 'zustand';
import { Message } from '../../types';

interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  includeScreenshot: boolean;
  includeClipboard: boolean;
  
  // Actions
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setIncludeScreenshot: (include: boolean) => void;
  setIncludeClipboard: (include: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  error: null,
  includeScreenshot: false,
  includeClipboard: false,

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  updateLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.role === 'assistant') {
        lastMessage.content = content;
      }
      return { messages };
    }),

  clearMessages: () =>
    set({
      messages: [],
      error: null,
    }),

  setLoading: (loading) =>
    set({
      isLoading: loading,
    }),

  setError: (error) =>
    set({
      error,
      isLoading: false,
    }),

  setIncludeScreenshot: (include) =>
    set({
      includeScreenshot: include,
    }),

  setIncludeClipboard: (include) =>
    set({
      includeClipboard: include,
    }),
}));
