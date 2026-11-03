export interface Conversation {
  id: string;
  title: string;
  system_prompt?: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  files?: AttachedFile[];
  created_at: string;
  isStreaming?: boolean;
  error?: string;
}

export interface DocumentItem {
  id: string;
  conversation_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  chunk_count: number;
  created_at: string;
}

export interface UserMemory {
  id: string;
  content: string;
  created_at: string;
}

export interface AppSettings {
  assistant_name: string;
  system_prompt: string;
  model_name: string;
  temperature: string;
  api_key?: string;
  api_key_override?: string;
  backend_url?: string;
  has_env_key?: boolean;
}

export interface HealthStatus {
  status: string;
  gemini: {
    status: string;
    configured: boolean;
    available_models?: string[];
    message?: string;
  };
  default_model: string;
  assistant_name: string;
}
