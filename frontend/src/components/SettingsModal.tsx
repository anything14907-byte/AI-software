import React, { useState, useEffect } from 'react';
import {
  X,
  Bot,
  Brain,
  Key,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';
import { AppSettings, UserMemory, HealthStatus } from '../types';
import * as api from '../api/client';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSaveSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  memories: UserMemory[];
  onAddMemory: (content: string) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onClearMemories: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  memories,
  onAddMemory,
  onDeleteMemory,
  onClearMemories,
}) => {
  const [activeTab, setActiveTab] = useState<'persona' | 'memories' | 'api'>('persona');
  const [assistantName, setAssistantName] = useState(settings.assistant_name || 'Gemini Assistant');
  const [systemPrompt, setSystemPrompt] = useState(settings.system_prompt || '');
  const [modelName, setModelName] = useState(settings.model_name || 'gemini-2.5-flash');
  const [temperature, setTemperature] = useState(settings.temperature || '0.7');
  const [apiKey, setApiKey] = useState(settings.api_key_override || '');
  const [backendUrl, setBackendUrl] = useState(settings.backend_url || '');
  
  const [newMemory, setNewMemory] = useState('');
  const [isAddingMem, setIsAddingMem] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Health check state
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAssistantName(settings.assistant_name || 'Gemini Assistant');
      setSystemPrompt(settings.system_prompt || '');
      setModelName(settings.model_name || 'gemini-2.5-flash');
      setTemperature(settings.temperature || '0.7');
      setApiKey(settings.api_key_override || '');
      setBackendUrl(settings.backend_url || localStorage.getItem('backend_url') || '');
      checkApiHealth();
    }
  }, [isOpen, settings]);

  const checkApiHealth = async () => {
    setIsCheckingHealth(true);
    try {
      const h = await api.checkHealth();
      setHealthStatus(h);
    } catch {
      setHealthStatus(null);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      await onSaveSettings({
        assistant_name: assistantName.trim(),
        system_prompt: systemPrompt.trim(),
        model_name: modelName,
        temperature: temperature,
        api_key: apiKey.trim(),
        backend_url: backendUrl.trim(),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error('Failed to save settings', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemory.trim()) return;
    setIsAddingMem(true);
    try {
      await onAddMemory(newMemory.trim());
      setNewMemory('');
    } finally {
      setIsAddingMem(false);
    }
  };

  const handleResetDefaults = () => {
    setAssistantName('Gemini Assistant');
    setSystemPrompt(
      'You are Gemini Assistant, a helpful, thoughtful, and knowledgeable AI assistant. ' +
      'You give clear, accurate, and insightful responses. ' +
      'When writing code, provide clean, idiomatic code with clear explanations. Format responses using Markdown.'
    );
    setModelName('gemini-2.5-flash');
    setTemperature('0.7');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-dark-surface rounded-2xl shadow-2xl border border-gray-200 dark:border-dark-border overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 dark:border-dark-border px-6 gap-6 bg-gray-50/50 dark:bg-dark-bg/50">
          <button
            onClick={() => setActiveTab('persona')}
            className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'persona'
                ? 'border-gemini-600 text-gemini-600 dark:text-gemini-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Bot className="w-4 h-4" />
            Persona & Model
          </button>
          <button
            onClick={() => setActiveTab('memories')}
            className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'memories'
                ? 'border-gemini-600 text-gemini-600 dark:text-gemini-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Brain className="w-4 h-4" />
            User Memories ({memories.length})
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'api'
                ? 'border-gemini-600 text-gemini-600 dark:text-gemini-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Key className="w-4 h-4" />
            API Key & Status
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: Persona & Model */}
          {activeTab === 'persona' && (
            <div className="space-y-5">
              {/* Assistant Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Assistant Name
                </label>
                <input
                  type="text"
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500"
                  placeholder="e.g. Gemini Assistant, Socrates, Code Sensei"
                />
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Gemini Model
                </label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500"
                >
                  <option value="gemini-2.5-flash">gemini-2.5-flash (Recommended, ultra-fast & intelligent)</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash (High speed general assistant)</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro (Deep reasoning & extensive context)</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash (Fast & lightweight)</option>
                </select>
                <p className="mt-1 text-[11px] text-gray-400">
                  Model name can also be set via the <code className="font-mono">GEMINI_MODEL</code> environment variable.
                </p>
              </div>

              {/* Temperature Slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Creativity / Temperature: <span className="font-mono text-gemini-600">{temperature}</span>
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {parseFloat(temperature) < 0.3 ? 'Deterministic' : parseFloat(temperature) > 0.8 ? 'Creative' : 'Balanced'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.5"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="w-full accent-gemini-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400 px-0.5">
                  <span>0.0 (Precise)</span>
                  <span>0.7 (Default)</span>
                  <span>1.5 (Expressive)</span>
                </div>
              </div>

              {/* System Prompt / Instructions */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    System Instructions (Personality & Rules)
                  </label>
                  <button
                    onClick={handleResetDefaults}
                    className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to default
                  </button>
                </div>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={5}
                  className="w-full p-3 text-xs leading-relaxed font-sans rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500 resize-y"
                  placeholder="Describe how the assistant should behave, its tone, format preferences, etc."
                />
              </div>
            </div>
          )}

          {/* TAB 2: Persistent User Memories */}
          {activeTab === 'memories' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-800 dark:text-blue-300">
                <p className="font-semibold mb-1 flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-blue-600" />
                  What is Persistent Memory?
                </p>
                <p>
                  Facts and preferences stored here are automatically injected into the system prompt for <strong>all conversations</strong>. The assistant will remember your preferences, background, and favorite tools across chats even after restarts.
                </p>
              </div>

              {/* Add Memory Form */}
              <form onSubmit={handleCreateMemory} className="flex gap-2">
                <input
                  type="text"
                  value={newMemory}
                  onChange={(e) => setNewMemory(e.target.value)}
                  placeholder="e.g. 'I develop in Python and React', 'My name is Alex', 'Prefer concise responses'..."
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500"
                />
                <button
                  type="submit"
                  disabled={isAddingMem || !newMemory.trim()}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg bg-gemini-600 text-white hover:bg-gemini-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  {isAddingMem ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>Remember</span>
                </button>
              </form>

              {/* Memory Items List */}
              <div className="space-y-2 mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                  <span>Saved Memories ({memories.length})</span>
                  {memories.length > 0 && (
                    <button
                      onClick={onClearMemories}
                      className="text-red-500 hover:text-red-600 hover:underline flex items-center gap-1 text-[11px]"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear all memories
                    </button>
                  )}
                </div>

                {memories.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 dark:border-dark-border rounded-lg">
                    No memories saved yet. Add a fact above to help the assistant know you better!
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {memories.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border text-xs group"
                      >
                        <span className="text-gray-800 dark:text-gray-200">{m.content}</span>
                        <button
                          onClick={() => onDeleteMemory(m.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                          title="Forget this memory"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: API Key & Diagnostics */}
          {activeTab === 'api' && (
            <div className="space-y-5">
              {/* API Status Box */}
              <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Key className="w-4 h-4 text-gemini-600" />
                    Gemini Connection Status
                  </span>
                  <button
                    onClick={checkApiHealth}
                    disabled={isCheckingHealth}
                    className="text-xs text-gemini-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                  >
                    {isCheckingHealth ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Re-check status'}
                  </button>
                </div>

                {healthStatus ? (
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          healthStatus.gemini.configured ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                      <span className="font-medium text-gray-900 dark:text-white">
                        {healthStatus.gemini.configured ? 'API Connected & Healthy' : 'API Key Not Configured'}
                      </span>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-[11px]">
                      {healthStatus.gemini.message}
                    </p>
                    {healthStatus.gemini.available_models && (
                      <p className="text-[10px] text-gray-400">
                        Accessible models: {healthStatus.gemini.available_models.slice(0, 4).join(', ')}...
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Checking connection...</p>
                )}
              </div>

              {/* API Key Override Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings.has_env_key ? "Configured in backend/.env (leave empty to use .env)" : "AIzaSy..."}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  {settings.has_env_key
                    ? "✓ An API key is currently detected from your backend/.env file."
                    : "No key found in .env. You can enter your API key here or add it to backend/.env."}
                </p>
              </div>

              {/* Backend Server URL (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  FastAPI Backend Server URL (Optional)
                </label>
                <input
                  type="text"
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  placeholder="e.g. https://my-fastapi-backend.onrender.com (leave empty for local / direct mode)"
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gemini-500/20 focus:border-gemini-500"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  On GitHub Pages, you can either enter your deployed backend URL or leave it empty to stream directly from Google Gemini in your browser!
                </p>
              </div>

              {/* Free Key Helper Box */}
              <div className="p-3.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" />
                  Need a Gemini API key?
                </p>
                <p className="text-[11px]">
                  Google provides free API keys for developers with generous rate limits. Get yours in 30 seconds at:
                </p>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-gemini-600 dark:text-gemini-400 font-semibold underline hover:opacity-80"
                >
                  Google AI Studio → Get API Key ↗
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-200 dark:border-dark-border bg-gray-50/50 dark:bg-dark-bg/50">
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <Check className="w-3.5 h-3.5" />
                Settings saved!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-gemini-600 text-white hover:bg-gemini-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-sm"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

