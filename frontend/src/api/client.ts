import { Conversation, Message, DocumentItem, UserMemory, AppSettings, HealthStatus } from '../types';

const API_BASE = '/api';

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

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
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
// Conversations API
// ============================================================================

export async function fetchConversations(): Promise<Conversation[]> {
  return request<Conversation[]>('/conversations');
}

export async function createConversation(title: string = 'New Chat', system_prompt?: string): Promise<Conversation> {
  return request<Conversation>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title, system_prompt }),
  });
}

export async function getConversation(convId: string): Promise<Conversation & { messages: Message[]; documents: DocumentItem[] }> {
  return request<Conversation & { messages: Message[]; documents: DocumentItem[] }>(`/conversations/${convId}`);
}

export async function updateConversation(convId: string, updates: { title?: string; system_prompt?: string }): Promise<Conversation> {
  return request<Conversation>(`/conversations/${convId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteConversation(convId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/conversations/${convId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// Documents API (RAG)
// ============================================================================

export async function uploadDocument(convId: string, file: File): Promise<{ success: boolean; document: DocumentItem; message: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ success: boolean; document: DocumentItem; message: string }>(`/conversations/${convId}/upload`, {
    method: 'POST',
    body: formData,
  });
}

export async function deleteDocument(docId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/documents/${docId}`, {
    method: 'DELETE',
  });
}

// ============================================================================
// User Memories API
// ============================================================================

export async function fetchMemories(): Promise<UserMemory[]> {
  return request<UserMemory[]>('/memories');
}

export async function addMemory(content: string): Promise<UserMemory> {
  return request<UserMemory>('/memories', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function deleteMemory(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/memories/${id}`, {
    method: 'DELETE',
  });
}

export async function clearAllMemories(): Promise<{ success: boolean; deleted_count: number }> {
  return request<{ success: boolean; deleted_count: number }>('/memories', {
    method: 'DELETE',
  });
}

// ============================================================================
// Settings API
// ============================================================================

export async function fetchSettings(): Promise<AppSettings> {
  return request<AppSettings>('/settings');
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  return request<AppSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function checkHealth(): Promise<HealthStatus> {
  return request<HealthStatus>('/health');
}

// ============================================================================
// SSE Chat Stream Reader
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
  const url = `${API_BASE}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err: any) {
    if (signal.aborted) {
      return; // User canceled stream intentionally
    }
    callbacks.onError(`Network error: ${err.message}`, 'network_error');
    return;
  }

  if (!response.ok) {
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
          if (jsonStr === '[DONE]') {
            return;
          }

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
          } catch (e) {
            // ignore non-json SSE lines
          }
        }
      }
    }
  } catch (err: any) {
    if (signal.aborted) {
      // Aborted by user clicking Stop Generating
      return;
    }
    callbacks.onError(`Stream interrupted: ${err.message}`, 'stream_interrupted');
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

