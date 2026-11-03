import { Conversation, Message, DocumentItem, UserMemory, AppSettings, HealthStatus } from '../types';

export class ApiError extends Error {
  status: number;
  errorType?: string;
  constructor(message: string, status: number = 500, errorType?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorType = errorType;
  }
}

export function getApiBase(): string {
  const custom = localStorage.getItem('backend_url');
  if (custom && custom.trim()) return custom.trim().replace(/\/$/, '');
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/$/, '');
  return '/api';
}

// LocalStorage Keys for standalone / GitHub Pages mode
const LS_CONVERSATIONS = 'gemini_chat_conversations';
const LS_MESSAGES_PREFIX = 'gemini_chat_messages_';
const LS_MEMORIES = 'gemini_chat_memories';
const LS_SETTINGS = 'gemini_chat_settings';
const LS_DOCS_PREFIX = 'gemini_chat_docs_';

function isBackendAvailable(): boolean {
  return localStorage.getItem('backend_mode') !== 'offline';
}

// ============================================================================
// Network Request with Standalone Fallback
// ============================================================================

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiBase = getApiBase();
  const url = `${apiBase}${endpoint}`;
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      let errorMsg = `Server error (${res.status})`;
      let errorType = 'http_error';
      try {
        const data = await res.json();
        errorMsg = data.detail || data.error || errorMsg;
        errorType = data.error_type || errorType;
      } catch {
        const text = await res.text();
        if (text) errorMsg = text;
      }
      throw new ApiError(errorMsg, res.status, errorType);
    }
    return await res.json() as T;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') throw err;
    throw new ApiError(`Network connection failed: ${err.message}`, 0, 'network_error');
  }
}

// ============================================================================
// Conversations API (Backend + LocalStorage Fallback)
// ============================================================================

export async function fetchConversations(): Promise<Conversation[]> {
  try {
    return await request<Conversation[]>('/conversations');
  } catch (e) {
    // Fallback to localStorage (GitHub Pages / Standalone mode)
    const raw = localStorage.getItem(LS_CONVERSATIONS);
    return raw ? JSON.parse(raw) : [];
  }
}

export async function createConversation(title: string = 'New Chat', system_prompt?: string): Promise<Conversation> {
  try {
    return await request<Conversation>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, system_prompt }),
    });
  } catch (e) {
    const newConv: Conversation = {
      id: 'conv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      title: title || 'New Chat',
      system_prompt: system_prompt || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0,
    };
    const list = await fetchConversations();
    localStorage.setItem(LS_CONVERSATIONS, JSON.stringify([newConv, ...list]));
    return newConv;
  }
}

export async function getConversation(convId: string): Promise<Conversation & { messages: Message[]; documents: DocumentItem[] }> {
  try {
    return await request<Conversation & { messages: Message[]; documents: DocumentItem[] }>(`/conversations/${convId}`);
  } catch (e) {
    const convs = await fetchConversations();
    const conv = convs.find(c => c.id === convId) || {
      id: convId,
      title: 'Chat',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const rawMsgs = localStorage.getItem(LS_MESSAGES_PREFIX + convId);
    const messages = rawMsgs ? JSON.parse(rawMsgs) : [];
    const rawDocs = localStorage.getItem(LS_DOCS_PREFIX + convId);
    const documents = rawDocs ? JSON.parse(rawDocs) : [];
    return { ...conv, messages, documents };
  }
}

export async function updateConversation(convId: string, updates: { title?: string; system_prompt?: string }): Promise<Conversation> {
  try {
    return await request<Conversation>(`/conversations/${convId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  } catch (e) {
    const list = await fetchConversations();
    const updated = list.map(c => c.id === convId ? { ...c, ...updates, updated_at: new Date().toISOString() } : c);
    localStorage.setItem(LS_CONVERSATIONS, JSON.stringify(updated));
    return updated.find(c => c.id === convId)!;
  }
}

export async function deleteConversation(convId: string): Promise<{ success: boolean }> {
  try {
    return await request<{ success: boolean }>(`/conversations/${convId}`, {
      method: 'DELETE',
    });
  } catch (e) {
    const list = await fetchConversations();
    localStorage.setItem(LS_CONVERSATIONS, JSON.stringify(list.filter(c => c.id !== convId)));
    localStorage.removeItem(LS_MESSAGES_PREFIX + convId);
    localStorage.removeItem(LS_DOCS_PREFIX + convId);
    return { success: true };
  }
}

// ============================================================================
// Documents API (RAG with In-Browser Fallback)
// ============================================================================

export async function uploadDocument(convId: string, file: File): Promise<{ success: boolean; document: DocumentItem; message: string }> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    return await request<{ success: boolean; document: DocumentItem; message: string }>(`/conversations/${convId}/upload`, {
      method: 'POST',
      body: formData,
    });
  } catch (e) {
    // In-browser text extraction fallback
    const text = await file.text();
    const docItem: DocumentItem = {
      id: 'doc-' + Date.now(),
      conversation_id: convId,
      filename: file.name,
      file_type: file.name.split('.').pop() || 'txt',
      file_size: file.size,
      chunk_count: Math.max(1, Math.ceil(text.length / 600)),
      created_at: new Date().toISOString(),
    };
    const raw = localStorage.getItem(LS_DOCS_PREFIX + convId);
    const existing = raw ? JSON.parse(raw) : [];
    localStorage.setItem(LS_DOCS_PREFIX + convId, JSON.stringify([docItem, ...existing]));
    // Save chunk content in localStorage for browser RAG
    localStorage.setItem(`gemini_doc_content_${docItem.id}`, text);
    return {
      success: true,
      document: docItem,
      message: `Processed '${file.name}' into ${docItem.chunk_count} chunks.`,
    };
  }
}

export async function deleteDocument(docId: string): Promise<{ success: boolean }> {
  try {
    return await request<{ success: boolean }>(`/documents/${docId}`, {
      method: 'DELETE',
    });
  } catch (e) {
    localStorage.removeItem(`gemini_doc_content_${docId}`);
    return { success: true };
  }
}

// ============================================================================
// User Memories API
// ============================================================================

export async function fetchMemories(): Promise<UserMemory[]> {
  try {
    return await request<UserMemory[]>('/memories');
  } catch (e) {
    const raw = localStorage.getItem(LS_MEMORIES);
    return raw ? JSON.parse(raw) : [];
  }
}

export async function addMemory(content: string): Promise<UserMemory> {
  try {
    return await request<UserMemory>('/memories', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  } catch (e) {
    const mem: UserMemory = {
      id: 'mem-' + Date.now(),
      content: content.trim(),
      created_at: new Date().toISOString(),
    };
    const list = await fetchMemories();
    localStorage.setItem(LS_MEMORIES, JSON.stringify([mem, ...list]));
    return mem;
  }
}

export async function deleteMemory(id: string): Promise<{ success: boolean }> {
  try {
    return await request<{ success: boolean }>(`/memories/${id}`, {
      method: 'DELETE',
    });
  } catch (e) {
    const list = await fetchMemories();
    localStorage.setItem(LS_MEMORIES, JSON.stringify(list.filter(m => m.id !== id)));
    return { success: true };
  }
}

export async function clearAllMemories(): Promise<{ success: boolean; deleted_count: number }> {
  try {
    return await request<{ success: boolean; deleted_count: number }>('/memories', {
      method: 'DELETE',
    });
  } catch (e) {
    localStorage.removeItem(LS_MEMORIES);
    return { success: true, deleted_count: 0 };
  }
}

// ============================================================================
// Settings API
// ============================================================================

export async function fetchSettings(): Promise<AppSettings> {
  try {
    const backendSettings = await request<AppSettings>('/settings');
    const localKey = localStorage.getItem('gemini_api_key');
    const backendUrl = localStorage.getItem('backend_url') || '';
    return {
      ...backendSettings,
      api_key_override: localKey || backendSettings.api_key_override || '',
      backend_url: backendUrl,
    };
  } catch (e) {
    const raw = localStorage.getItem(LS_SETTINGS);
    const localKey = localStorage.getItem('gemini_api_key') || '';
    const backendUrl = localStorage.getItem('backend_url') || '';
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...parsed, api_key_override: localKey || parsed.api_key_override, backend_url: backendUrl };
    }
    return {
      assistant_name: 'Gemini Assistant',
      system_prompt: 'You are Gemini Assistant, a helpful, thoughtful, and knowledgeable AI assistant.',
      model_name: 'gemini-2.5-flash',
      temperature: '0.7',
      api_key_override: localKey,
      backend_url: backendUrl,
      has_env_key: false,
    };
  }
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  if (settings.api_key !== undefined) {
    localStorage.setItem('gemini_api_key', settings.api_key);
  }
  if (settings.backend_url !== undefined) {
    localStorage.setItem('backend_url', settings.backend_url);
  }

  try {
    return await request<AppSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  } catch (e) {
    const current = await fetchSettings();
    const merged = { ...current, ...settings };
    localStorage.setItem(LS_SETTINGS, JSON.stringify(merged));
    return merged;
  }
}

export async function checkHealth(): Promise<HealthStatus> {
  try {
    return await request<HealthStatus>('/health');
  } catch (e) {
    // Standalone check directly with Google Gemini
    const key = localStorage.getItem('gemini_api_key') || '';
    if (!key) {
      return {
        status: 'standalone',
        gemini: {
          status: 'missing_key',
          configured: false,
          message: 'No API key configured. Enter your Gemini API key in Settings (⚙️).'
        },
        default_model: 'gemini-2.5-flash',
        assistant_name: 'Gemini Assistant'
      };
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (res.ok) {
        return {
          status: 'standalone_connected',
          gemini: {
            status: 'ok',
            configured: true,
            available_models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
            message: 'Direct browser connection to Gemini API healthy.'
          },
          default_model: 'gemini-2.5-flash',
          assistant_name: 'Gemini Assistant'
        };
      } else {
        return {
          status: 'standalone',
          gemini: {
            status: 'invalid_key',
            configured: false,
            message: 'Invalid Gemini API key. Please check your key.'
          },
          default_model: 'gemini-2.5-flash',
          assistant_name: 'Gemini Assistant'
        };
      }
    } catch {
      return {
        status: 'offline',
        gemini: {
          status: 'network_error',
          configured: false,
          message: 'Could not connect to Gemini API. Check your internet connection.'
        },
        default_model: 'gemini-2.5-flash',
        assistant_name: 'Gemini Assistant'
      };
    }
  }
}

// ============================================================================
// SSE Chat Stream Reader (Dual-Mode: Backend or Direct Gemini API)
// ============================================================================

interface StreamCallbacks {
  onChunk: (text: string) => void;
  onTitle?: (newTitle: string) => void;
  onDone?: (messageId: string, fullContent: string) => void;
  onError: (errorMessage: string, errorType?: string) => void;
}

export async function streamChatResponse(
  endpoint: string,
  payload: Record<string, any>,
  signal: AbortSignal,
  callbacks: StreamCallbacks
): Promise<void> {
  const apiBase = getApiBase();
  const url = `${apiBase}${endpoint}`;

  let backendFailed = false;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (response.ok) {
      // Process SSE from FastAPI backend
      await readSseStream(response, signal, callbacks);
      return;
    } else {
      if (response.status === 404 && (apiBase === '/api' || !apiBase)) {
        // Backend not mounted (e.g. GitHub Pages static hosting)
        backendFailed = true;
      } else {
        let errDetail = `Server error (${response.status})`;
        try {
          const errJson = await response.json();
          errDetail = errJson.detail || errJson.error || errDetail;
        } catch {
          const text = await response.text();
          if (text) errDetail = text;
        }
        callbacks.onError(errDetail);
        return;
      }
    }
  } catch (err: any) {
    if (signal.aborted) return;
    backendFailed = true;
  }

  // If backend was unreachable or 404 (GitHub Pages mode), stream directly to Gemini API!
  if (backendFailed) {
    await streamDirectGemini(payload, signal, callbacks);
  }
}

async function readSseStream(response: Response, signal: AbortSignal, callbacks: StreamCallbacks) {
  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError('ReadableStream not supported by browser.');
    return;
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.substring(6).trim();
          if (jsonStr === '[DONE]') return;

          try {
            const data = JSON.parse(jsonStr);
            if (data.type === 'chunk' && data.text) {
              callbacks.onChunk(data.text);
            } else if (data.type === 'title' && data.title && callbacks.onTitle) {
              callbacks.onTitle(data.title);
            } else if (data.type === 'done' && callbacks.onDone) {
              callbacks.onDone(data.message_id, data.content);
            } else if (data.type === 'error') {
              callbacks.onError(data.error || 'Stream error occurred', data.error_type);
            }
          } catch {}
        }
      }
    }
  } catch (err: any) {
    if (signal.aborted) return;
    callbacks.onError(`Stream interrupted: ${err.message}`, 'stream_interrupted');
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

async function streamDirectGemini(
  payload: Record<string, any>,
  signal: AbortSignal,
  callbacks: StreamCallbacks
): Promise<void> {
  const apiKey = payload.api_key || localStorage.getItem('gemini_api_key') || '';
  if (!apiKey) {
    callbacks.onError(
      'Gemini API key is required on GitHub Pages. Please click Settings (⚙️) and enter your free Gemini API key from https://aistudio.google.com/app/apikey.',
      'missing_api_key'
    );
    return;
  }

  const model = payload.model_name || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  // Retrieve message history from localStorage
  const convId = payload.conversation_id;
  const rawMsgs = localStorage.getItem(LS_MESSAGES_PREFIX + convId);
  const existingMsgs: Message[] = rawMsgs ? JSON.parse(rawMsgs) : [];

  // Add new user message to storage
  const userMsg: Message = {
    id: 'user-' + Date.now(),
    conversation_id: convId,
    role: 'user',
    content: payload.message || payload.new_content || '',
    created_at: new Date().toISOString(),
  };

  const updatedHistory = [...existingMsgs, userMsg];
  localStorage.setItem(LS_MESSAGES_PREFIX + convId, JSON.stringify(updatedHistory));

  // Build Gemini contents payload
  const contents = updatedHistory
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const geminiPayload: any = {
    contents,
    generationConfig: {
      temperature: payload.temperature !== undefined ? payload.temperature : 0.7,
      maxOutputTokens: 8192,
    }
  };

  // Add system instruction if memories or custom prompt exist
  const rawMemories = localStorage.getItem(LS_MEMORIES);
  const memories: UserMemory[] = rawMemories ? JSON.parse(rawMemories) : [];
  const rawSettings = localStorage.getItem(LS_SETTINGS);
  const settings = rawSettings ? JSON.parse(rawSettings) : {};

  const instructions = [
    `Your name is ${settings.assistant_name || 'Gemini Assistant'}.`,
    settings.system_prompt || 'You are a helpful, thoughtful, and knowledgeable AI assistant.'
  ];

  if (memories.length > 0) {
    instructions.push('Persistent user facts: ' + memories.map(m => m.content).join('; '));
  }

  geminiPayload.system_instruction = {
    parts: [{ text: instructions.join('\n') }]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
      signal,
    });

    if (!res.ok) {
      let errText = await res.text();
      try {
        const errJson = JSON.parse(errText);
        errText = errJson.error?.message || errText;
      } catch {}
      if (res.status === 400 && errText.includes('API_KEY_INVALID')) {
        callbacks.onError('Invalid Gemini API key. Please check your key in Settings (⚙️).', 'invalid_api_key');
      } else {
        callbacks.onError(`Gemini API error (${res.status}): ${errText}`);
      }
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const str = line.substring(6).trim();
          if (str === '[DONE]') break;
          try {
            const data = JSON.parse(str);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              fullText += text;
              callbacks.onChunk(text);
            }
          } catch {}
        }
      }
    }

    const assistantMsgId = 'asst-' + Date.now();
    const assistantMsg: Message = {
      id: assistantMsgId,
      conversation_id: convId,
      role: 'assistant',
      content: fullText,
      created_at: new Date().toISOString(),
    };

    localStorage.setItem(
      LS_MESSAGES_PREFIX + convId,
      JSON.stringify([...updatedHistory, assistantMsg])
    );

    // Auto title if first turn
    if (existingMsgs.length === 0 && callbacks.onTitle) {
      const generatedTitle = (payload.message || 'New Chat').slice(0, 30);
      callbacks.onTitle(generatedTitle);
      const convs = await fetchConversations();
      const updated = convs.map(c => c.id === convId ? { ...c, title: generatedTitle } : c);
      localStorage.setItem(LS_CONVERSATIONS, JSON.stringify(updated));
    }

    if (callbacks.onDone) {
      callbacks.onDone(assistantMsgId, fullText);
    }
  } catch (err: any) {
    if (signal.aborted) return;
    callbacks.onError(`Stream interrupted: ${err.message}`);
  }
}
