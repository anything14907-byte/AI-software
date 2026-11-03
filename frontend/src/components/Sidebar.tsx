import React, { useState } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Search,
  PanelLeftClose,
  Sparkles,
} from 'lucide-react';
import { Conversation } from '../types';

interface SidebarProps {
  conversations: Conversation[];
  activeConvId: string | null;
  onSelectConv: (id: string) => void;
  onNewChat: () => void;
  onRenameConv: (id: string, newTitle: string) => void;
  onDeleteConv: (id: string) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConvId,
  onSelectConv,
  onNewChat,
  onRenameConv,
  onDeleteConv,
  isDark,
  onToggleTheme,
  onOpenSettings,
  isOpen,
  onClose,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startEditing = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const saveEditing = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (editTitle.trim()) {
      onRenameConv(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      onDeleteConv(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId((prev) => (prev === id ? null : prev)), 4000);
    }
  };

  // Group conversations by date
  const filteredConvs = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupConversations = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const groups: { [key: string]: Conversation[] } = {
      Today: [],
      Yesterday: [],
      'Previous 7 Days': [],
      Older: [],
    };

    filteredConvs.forEach((conv) => {
      const convDate = new Date(conv.updated_at);
      if (convDate >= today) {
        groups.Today.push(conv);
      } else if (convDate >= yesterday) {
        groups.Yesterday.push(conv);
      } else if (convDate >= sevenDaysAgo) {
        groups['Previous 7 Days'].push(conv);
      } else {
        groups.Older.push(conv);
      }
    });

    return groups;
  };

  const grouped = groupConversations();

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-72 bg-[#f9fafb] dark:bg-[#18191b] border-r border-gray-200 dark:border-dark-border flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Header & New Chat Button */}
        <div className="p-3.5 space-y-2 border-b border-gray-200/70 dark:border-dark-border/60">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gemini-600 flex items-center justify-center text-white shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-semibold text-sm tracking-tight text-gray-900 dark:text-white">
                Gemini Assistant
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 md:hidden"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={() => {
              onNewChat();
              if (window.innerWidth < 768) onClose();
            }}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-hover shadow-xs transition-all group"
          >
            <span className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-gemini-600 group-hover:rotate-90 transition-transform duration-200" />
              New chat
            </span>
            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-dark-bg px-1.5 py-0.5 rounded border border-gray-200 dark:border-dark-border">
              ⌘K
            </span>
          </button>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full py-1.5 pl-8 pr-3 text-xs bg-gray-100/70 dark:bg-dark-bg border border-transparent dark:border-dark-border rounded-lg text-gray-900 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:border-gemini-500"
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {conversations.length === 0 ? (
            <div className="text-center py-8 px-4 text-xs text-gray-400">
              No conversations yet. Start a new chat above!
            </div>
          ) : (
            Object.entries(grouped).map(([groupTitle, convs]) => {
              if (convs.length === 0) return null;
              return (
                <div key={groupTitle} className="space-y-1">
                  <div className="px-2.5 py-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {groupTitle}
                  </div>
                  {convs.map((conv) => {
                    const isActive = conv.id === activeConvId;
                    const isEditingThis = editingId === conv.id;
                    const isConfirmingDelete = confirmDeleteId === conv.id;

                    return (
                      <div
                        key={conv.id}
                        onClick={() => {
                          onSelectConv(conv.id);
                          if (window.innerWidth < 768) onClose();
                        }}
                        className={`group relative flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-blue-50/80 dark:bg-dark-surface text-gemini-700 dark:text-gemini-300 shadow-xs'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover'
                        }`}
                      >
                        {isEditingThis ? (
                          <div className="flex items-center gap-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEditing(conv.id);
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="flex-1 px-1.5 py-0.5 text-xs bg-white dark:bg-dark-bg border border-gemini-500 rounded focus:outline-none text-gray-900 dark:text-white"
                              autoFocus
                            />
                            <button
                              onClick={(e) => saveEditing(conv.id, e)}
                              className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                              title="Save"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="p-1 rounded text-gray-400 hover:bg-gray-200 dark:hover:bg-dark-hover"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 truncate flex-1 min-w-0 pr-2">
                              <MessageSquare
                                className={`w-3.5 h-3.5 flex-shrink-0 ${
                                  isActive ? 'text-gemini-600 dark:text-gemini-400' : 'text-gray-400'
                                }`}
                              />
                              <span className="truncate" title={conv.title}>
                                {conv.title}
                              </span>
                            </div>

                            {/* Item Action Buttons */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => startEditing(conv, e)}
                                className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/60 dark:hover:bg-dark-hover"
                                title="Rename chat"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteClick(conv.id, e)}
                                className={`p-1 rounded transition-colors ${
                                  isConfirmingDelete
                                    ? 'bg-red-500 text-white hover:bg-red-600'
                                    : 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                                }`}
                                title={isConfirmingDelete ? 'Click again to permanently delete' : 'Delete chat'}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Theme Toggle & Settings */}
        <div className="p-3 border-t border-gray-200/70 dark:border-dark-border/60 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <button
            onClick={onToggleTheme}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors font-medium"
            title="Toggle light / dark mode"
          >
            {isDark ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Light mode</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-indigo-500" />
                <span>Dark mode</span>
              </>
            )}
          </button>

          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-700 dark:text-gray-300 transition-colors font-medium"
            title="Settings and Preferences"
          >
            <SettingsIcon className="w-4 h-4 text-gray-500" />
            <span>Settings</span>
          </button>
        </div>
      </aside>
    </>
  );
};

