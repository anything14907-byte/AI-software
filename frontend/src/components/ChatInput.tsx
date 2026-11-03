import React, { useRef, useEffect } from 'react';
import { ArrowUp, Square, Paperclip, FileText, X, Loader2 } from 'lucide-react';
import { DocumentItem } from '../types';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  onFileUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  attachedDocs: DocumentItem[];
  onDeleteDoc: (docId: string) => void;
  modelName: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  onStop,
  isGenerating,
  onFileUpload,
  isUploading,
  attachedDocs,
  onDeleteDoc,
  modelName,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea height as content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && (input.trim() || attachedDocs.length > 0)) {
        onSend();
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await onFileUpload(file);
      // Reset input value so same file can be uploaded again if needed
      e.target.value = '';
    }
  };

  const canSend = !isGenerating && (input.trim().length > 0 || attachedDocs.length > 0);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      {/* Attached Documents Chips */}
      {attachedDocs.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
          {attachedDocs.map((doc) => (
            <div
              key={doc.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-700 dark:text-blue-300 shadow-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="max-w-[150px] truncate font-medium" title={doc.filename}>
                {doc.filename}
              </span>
              <span className="text-[10px] text-blue-500">
                ({doc.chunk_count} chunks)
              </span>
              <button
                onClick={() => onDeleteDoc(doc.id)}
                className="p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-900 transition-colors ml-0.5"
                title="Remove file from chat"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Box Card */}
      <div className="relative flex flex-col rounded-2xl border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-surface shadow-sm focus-within:ring-2 focus-within:ring-gemini-500/20 focus-within:border-gemini-500 transition-all">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything, or upload a PDF/TXT to analyze..."
          rows={1}
          className="w-full py-3.5 pl-4 pr-12 text-sm bg-transparent border-0 focus:outline-none focus:ring-0 text-gray-900 dark:text-dark-text placeholder-gray-400 dark:placeholder-gray-500 resize-none max-h-[180px]"
        />

        {/* Action Controls Footer inside input */}
        <div className="flex items-center justify-between px-3 pb-2 pt-1">
          {/* File Upload Button */}
          <div className="flex items-center gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.json,.csv,.py"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isGenerating}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors disabled:opacity-50"
              title="Upload PDF or TXT for RAG knowledge retrieval"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-gemini-600" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Paperclip className="w-4 h-4" />
                  <span>Attach document</span>
                </>
              )}
            </button>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 select-none hidden sm:inline">
              PDF, TXT, MD
            </span>
          </div>

          {/* Send / Stop Generating Button */}
          <div className="flex items-center gap-2">
            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-red-600 dark:hover:bg-red-500 dark:hover:text-white transition-all text-xs font-semibold shadow-xs"
                title="Stop generation"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                className={`p-2 rounded-xl transition-all ${
                  canSend
                    ? 'bg-gemini-600 hover:bg-gemini-700 text-white shadow-sm'
                    : 'bg-gray-200 dark:bg-dark-border text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
                title="Send message (Enter)"
              >
                <ArrowUp className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Model & Disclaimer Footnote */}
      <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-gray-400 dark:text-gray-500">
        <span>Powered by <strong className="text-gray-600 dark:text-gray-300 font-medium">{modelName}</strong></span>
        <span>Press <kbd className="font-mono bg-gray-100 dark:bg-dark-surface px-1 py-0.5 rounded border border-gray-300 dark:border-dark-border text-[10px]">Shift + Enter</kbd> for new line</span>
      </div>
    </div>
  );
};

