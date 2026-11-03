import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Sparkles,
  Zap,
  Code2,
  FileQuestion,
  BookOpen,
  ArrowRight,
  Settings as SettingsIcon,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { Conversation, Message, DocumentItem, UserMemory, AppSettings } from './types';
import * as api from './api/client';
import { Sidebar } from './components/Sidebar';
import { ChatMessage } from './components/ChatMessage';
import { ChatInput } from './components/ChatInput';
import { SettingsModal } from './components/SettingsModal';

export const App: React.FC = () => {
  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Data state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachedDocs, setAttachedDocs] = useState<DocumentItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    assistant_name: 'Gemini Assistant',
    system_prompt: '',
    model_name: 'gemini-2.5-flash',
    temperature: '0.7',
  });
  const [memories, setMemories] = useState<UserMemory[]>([]);

  // UI state
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Streaming ref
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef<boolean>(true);

  // Apply theme to HTML tag
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  // Initial load
  useEffect(() => {
    loadInitialData();

    // Keyboard shortcut for New Chat (Cmd+K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadInitialData = async () => {
    try {
      const [convs, setts, mems] = await Promise.all([
        api.fetchConversations(),
        api.fetchSettings(),
        api.fetchMemories(),
      ]);
      setConversations(convs);
      setSettings(setts);
      setMemories(mems);

      if (convs.length > 0) {
        selectConversation(convs[0].id);
      } else {
        handleNewChat();
      }
    } catch (e) {
      console.error('Failed to load initial data', e);
    }
  };

  // Select a conversation and load messages & docs
  const selectConversation = async (convId: string) => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
    setActiveConvId(convId);
    try {
      const convData = await api.getConversation(convId);
      setMessages(convData.messages || []);
      setAttachedDocs(convData.documents || []);
    } catch (e) {
      console.error('Failed to load conversation details', e);
    }
  };

  // Create new conversation
  const handleNewChat = async () => {
    if (isGenerating && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsGenerating(false);
    }
    try {
      const newConv = await api.createConversation('New Chat');
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(newConv.id);
      setMessages([]);
      setAttachedDocs([]);
      setInput('');
    } catch (e) {
      console.error('Failed to create new conversation', e);
    }
  };

  // Rename conversation
  const handleRenameConv = async (id: string, newTitle: string) => {
    try {
      const updated = await api.updateConversation(id, { title: newTitle });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c))
      );
    } catch (e) {
      console.error('Failed to rename conversation', e);
    }
  };

  // Delete conversation
  const handleDeleteConv = async (id: string) => {
    try {
      await api.deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (activeConvId === id) {
        if (remaining.length > 0) {
          selectConversation(remaining[0].id);
        } else {
          handleNewChat();
        }
      }
    } catch (e) {
      console.error('Failed to delete conversation', e);
    }
  };

  // Upload file (PDF / TXT for RAG)
  const handleFileUpload = async (file: File) => {
    if (!activeConvId) return;
    setIsUploading(true);
    try {
      const res = await api.uploadDocument(activeConvId, file);
      if (res.success && res.document) {
        setAttachedDocs((prev) => [res.document, ...prev]);
      }
    } catch (err: any) {
      alert(`File upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await api.deleteDocument(docId);
      setAttachedDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (e) {
      console.error('Failed to delete document', e);
    }
  };

  // Auto-scroll logic
  const scrollToBottom = () => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      shouldAutoScrollRef.current = isAtBottom;
    }
  };

  // Stop Generation
  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
  };

  // Stream chat helper
  const executeChatStream = async (
    endpoint: string,
    payload: Record<string, any>,
    tempUserMsg?: Message
  ) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    shouldAutoScrollRef.current = true;

    const assistantMsgId = `temp-${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      conversation_id: activeConvId!,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
      isStreaming: true,
    };

    if (tempUserMsg) {
      setMessages((prev) => [...prev, tempUserMsg, initialAssistantMsg]);
    } else {
      setMessages((prev) => [...prev, initialAssistantMsg]);
    }

    await api.streamChatResponse(
      endpoint,
      payload,
      controller.signal,
      {
        onChunk: (text: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content + text }
                : m
            )
          );
        },
        onTitle: (newTitle: string) => {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeConvId ? { ...c, title: newTitle } : c
            )
          );
        },
        onDone: (savedId: string, fullContent: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, id: savedId, content: fullContent, isStreaming: false }
                : m
            )
          );
          setIsGenerating(false);
          abortControllerRef.current = null;
        },
        onError: (errorMsg: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, isStreaming: false, error: errorMsg }
                : m
            )
          );
          setIsGenerating(false);
          abortControllerRef.current = null;
        },
      }
    );
  };

  // Send new message
  const handleSendMessage = async () => {
    if (!input.trim() || !activeConvId || isGenerating) return;

    const userText = input.trim();
    setInput('');

    const tempUserMsg: Message = {
      id: `user-${Date.now()}`,
      conversation_id: activeConvId,
      role: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };

    await executeChatStream(
      '/chat/stream',
      {
        conversation_id: activeConvId,
        message: userText,
        model_name: settings.model_name,
        temperature: parseFloat(settings.temperature),
        api_key: settings.api_key_override,
      },
      tempUserMsg
    );
  };

  // Regenerate last response
  const handleRegenerate = async () => {
    if (!activeConvId || isGenerating) return;

    // Remove the last assistant message from local state
    setMessages((prev) => {
      const lastIndex = [...prev].reverse().findIndex((m) => m.role === 'assistant');
      if (lastIndex === -1) return prev;
      const actualIndex = prev.length - 1 - lastIndex;
      return prev.filter((_, idx) => idx !== actualIndex);
    });

    await executeChatStream(`/conversations/${activeConvId}/regenerate`, {
      model_name: settings.model_name,
      temperature: parseFloat(settings.temperature),
      api_key: settings.api_key_override,
    });
  };

  // Edit user message
  const handleEditMessage = async (messageId: string, newText: string) => {
    if (!activeConvId || isGenerating) return;

    // Locally slice messages up to the edited message
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex !== -1) {
      setMessages(messages.slice(0, msgIndex));
    }

    const updatedUserMsg: Message = {
      id: messageId,
      conversation_id: activeConvId,
      role: 'user',
      content: newText,
      created_at: new Date().toISOString(),
    };

    await executeChatStream(
      `/conversations/${activeConvId}/edit-message`,
      {
        message_id: messageId,
        new_content: newText,
        model_name: settings.model_name,
        temperature: parseFloat(settings.temperature),
        api_key: settings.api_key_override,
      },
      updatedUserMsg
    );
  };

  // Settings Actions
  const handleSaveSettings = async (newSettings: Partial<AppSettings>) => {
    const updated = await api.updateSettings(newSettings);
    setSettings(updated);
  };

  const handleAddMemory = async (content: string) => {
    const mem = await api.addMemory(content);
    setMemories((prev) => [mem, ...prev]);
  };

  const handleDeleteMemory = async (id: string) => {
    await api.deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const handleClearMemories = async () => {
    if (window.confirm('Are you sure you want to delete all persistent user memories?')) {
      await api.clearAllMemories();
      setMemories([]);
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);

  // Suggestions for empty chat state
  const suggestions = [
    {
      title: 'Analyze Code Architecture',
      desc: 'How should I structure a full-stack FastAPI and React project with SQLite?',
      icon: <Code2 className="w-4 h-4 text-blue-500" />,
    },
    {
      title: 'Document Analysis & RAG',
      desc: 'Upload a PDF or TXT to extract insights and ask questions about its content.',
      icon: <FileQuestion className="w-4 h-4 text-emerald-500" />,
    },
    {
      title: 'Explain Complex Topics',
      desc: 'Explain quantum computing and superpositions in simple intuitive terms.',
      icon: <BookOpen className="w-4 h-4 text-purple-500" />,
    },
    {
      title: 'Rapid Prototyping',
      desc: 'Write an asynchronous Python script that fetches and aggregates JSON feeds.',
      icon: <Zap className="w-4 h-4 text-amber-500" />,
    },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-dark-bg text-gray-900 dark:text-dark-text font-sans">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeConvId={activeConvId}
        onSelectConv={selectConversation}
        onNewChat={handleNewChat}
        onRenameConv={handleRenameConv}
        onDeleteConv={handleDeleteConv}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Chat View */}
      <main className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Top Header */}
        <header className="h-14 px-4 flex items-center justify-between border-b border-gray-200 dark:border-dark-border bg-white/80 dark:bg-dark-bg/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-dark-hover md:hidden"
              title="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-semibold text-sm truncate text-gray-900 dark:text-white max-w-[200px] sm:max-w-md">
              {activeConv?.title || 'New Chat'}
            </h1>
          </div>

          {/* Model Status Pill & Settings Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-dark-hover transition-colors shadow-xs"
              title="Assistant Model & Persona Settings"
            >
              <Cpu className="w-3.5 h-3.5 text-gemini-600 dark:text-gemini-400" />
              <span className="font-medium hidden sm:inline">{settings.model_name}</span>
              <SettingsIcon className="w-3 h-3 text-gray-400 ml-0.5" />
            </button>
          </div>
        </header>

        {/* Messages Scroll Area */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
        >
          {messages.length === 0 ? (
            /* Empty Chat State */
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto px-4 py-8 text-center animate-in fade-in duration-300">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg mb-4 ring-4 ring-blue-500/10">
                <Sparkles className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight mb-2">
                What can I help you with today?
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-8">
                Powered by Google Gemini with streaming intelligence, persistent memory, and document RAG.
              </p>

              {/* Quick Prompt Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInput(s.desc);
                    }}
                    className="p-3.5 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/50 dark:bg-dark-surface/50 hover:bg-white dark:hover:bg-dark-surface hover:border-gemini-400 dark:hover:border-gemini-500/50 transition-all shadow-xs group text-left"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-xs text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        {s.icon}
                        {s.title}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {s.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages List */
            <div className="divide-y divide-transparent">
              {messages.map((msg, idx) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isLastAssistant={
                    msg.role === 'assistant' &&
                    idx === messages.map((m) => m.role).lastIndexOf('assistant')
                  }
                  isGenerating={isGenerating}
                  assistantName={settings.assistant_name}
                  onRegenerate={handleRegenerate}
                  onEditMessage={handleEditMessage}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              ))}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Input Bar Area */}
        <div className="bg-gradient-to-t from-white via-white dark:from-dark-bg dark:via-dark-bg to-transparent pt-2">
          <ChatInput
            input={input}
            setInput={setInput}
            onSend={handleSendMessage}
            onStop={handleStopGenerating}
            isGenerating={isGenerating}
            onFileUpload={handleFileUpload}
            isUploading={isUploading}
            attachedDocs={attachedDocs}
            onDeleteDoc={handleDeleteDoc}
            modelName={settings.model_name}
          />
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        memories={memories}
        onAddMemory={handleAddMemory}
        onDeleteMemory={handleDeleteMemory}
        onClearMemories={handleClearMemories}
      />
    </div>
  );
};

