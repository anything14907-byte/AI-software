import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Sparkles, Copy, Check, RotateCw, Pencil, AlertCircle, Settings } from 'lucide-react';
import { Message } from '../types';
import { CodeBlock } from './CodeBlock';

interface ChatMessageProps {
  message: Message;
  isLastAssistant: boolean;
  isGenerating: boolean;
  assistantName: string;
  onRegenerate: () => void;
  onEditMessage: (messageId: string, newText: string) => void;
  onOpenSettings?: () => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  isLastAssistant,
  isGenerating,
  assistantName,
  onRegenerate,
  onEditMessage,
  onOpenSettings,
}) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy text', e);
    }
  };

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== message.content) {
      onEditMessage(message.id, editText.trim());
      setIsEditing(false);
    } else {
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditText(message.content);
    setIsEditing(false);
  };

  return (
    <div
      className={`group py-5 px-4 md:px-6 transition-colors ${
        isUser
          ? 'bg-transparent'
          : 'bg-gray-50/60 dark:bg-dark-surface/50 border-y border-gray-100 dark:border-dark-border/40'
      }`}
    >
      <div className="max-w-3xl mx-auto flex gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0 pt-0.5">
          {isUser ? (
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-gray-700 to-gray-500 flex items-center justify-center text-white shadow-sm">
              <User className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-sm ring-2 ring-blue-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
          )}
        </div>

        {/* Message Content Container */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              {isUser ? 'You' : assistantName || 'Gemini Assistant'}
            </span>

            {/* Action Buttons */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isUser && !isGenerating && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-dark-hover transition-colors"
                  title="Edit message"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {!isUser && !message.isStreaming && (
                <button
                  onClick={handleCopyMessage}
                  className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-dark-hover transition-colors"
                  title="Copy response"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
              {!isUser && isLastAssistant && !isGenerating && (
                <button
                  onClick={onRegenerate}
                  className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-dark-hover transition-colors"
                  title="Regenerate response"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* User Inline Editing Mode */}
          {isEditing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full p-2.5 text-sm rounded-lg border border-gemini-500 dark:border-gemini-400 bg-white dark:bg-dark-bg focus:outline-none focus:ring-2 focus:ring-gemini-500/20 text-gray-900 dark:text-dark-text resize-y min-h-[80px]"
                rows={3}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-gemini-600 text-white hover:bg-gemini-700 transition-colors shadow-sm"
                >
                  Save & Submit
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 break-words leading-relaxed">
              {/* Error Banner */}
              {message.error && (
                <div className="my-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 flex items-start gap-2.5 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                  <div className="flex-1">
                    <p className="font-semibold mb-0.5">Response Error</p>
                    <p>{message.error}</p>
                    {message.error.toLowerCase().includes('api key') && onOpenSettings && (
                      <button
                        onClick={onOpenSettings}
                        className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-100 dark:bg-red-900/50 hover:bg-red-200 text-red-800 dark:text-red-200 font-medium transition-colors"
                      >
                        <Settings className="w-3 h-3" />
                        Configure Gemini API Key
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Message text with Markdown */}
              {message.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ node, inline, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeContent = String(children).replace(/\n$/, '');
                      if (!inline && match) {
                        return (
                          <CodeBlock
                            language={match[1]}
                            value={codeContent}
                          />
                        );
                      } else if (!inline) {
                        return (
                          <CodeBlock
                            language="text"
                            value={codeContent}
                          />
                        );
                      }
                      return (
                        <code
                          className="px-1.5 py-0.5 mx-0.5 rounded bg-gray-100 dark:bg-dark-surface text-gemini-700 dark:text-gemini-300 font-mono text-xs border border-gray-200/60 dark:border-dark-border"
                          {...props}
                        >
                          {children}
                        </code>
                      );
                    },
                    p({ children }) {
                      return <p className="mb-2.5 last:mb-0">{children}</p>;
                    },
                    ul({ children }) {
                      return <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>;
                    },
                    ol({ children }) {
                      return <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>;
                    },
                    blockquote({ children }) {
                      return (
                        <blockquote className="border-l-4 border-gemini-500 pl-3.5 my-2 italic text-gray-600 dark:text-gray-400">
                          {children}
                        </blockquote>
                      );
                    },
                    table({ children }) {
                      return (
                        <div className="overflow-x-auto my-3 rounded border border-gray-200 dark:border-dark-border">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border text-xs">
                            {children}
                          </table>
                        </div>
                      );
                    },
                    th({ children }) {
                      return (
                        <th className="px-3 py-2 bg-gray-100 dark:bg-dark-surface font-semibold text-left">
                          {children}
                        </th>
                      );
                    },
                    td({ children }) {
                      return (
                        <td className="px-3 py-1.5 border-t border-gray-200 dark:border-dark-border">
                          {children}
                        </td>
                      );
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              ) : null}

              {/* Blinking streaming indicator */}
              {message.isStreaming && <span className="animate-cursor" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

