"""
Database layer for AI Chat Assistant.
Uses SQLite with WAL mode for fast, thread-safe, concurrent reads and writes.
"""

import os
import sqlite3
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import uuid

# Database file location (stored in backend/data/chat.db by default)
DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "chat.db")


def get_db_connection() -> sqlite3.Connection:
    """Creates a connection to SQLite database with row factory and WAL mode enabled."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initializes database schema and default settings."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Conversations table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            system_prompt TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    # Messages table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL, -- 'user', 'assistant', 'system'
            content TEXT NOT NULL,
            files_meta TEXT, -- JSON string of attached files
            created_at TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
    """)

    # Documents table (uploaded PDFs / TXTs)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            chunk_count INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
    """)

    # Document Chunks table (for RAG retrieval)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_chunks (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            conversation_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
    """)

    # Persistent User Memories table (facts remembered across chats)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_memories (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # Settings table (key-value store)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    # Create indexes for optimal query speed
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_conv ON document_chunks(conversation_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_docs_conv ON documents(conversation_id)")

    # Set default settings if not exists
    default_settings = {
        "assistant_name": os.getenv("DEFAULT_ASSISTANT_NAME", "Gemini Assistant"),
        "system_prompt": os.getenv(
            "DEFAULT_SYSTEM_PROMPT",
            "You are Gemini Assistant, a helpful, thoughtful, and knowledgeable AI assistant. "
            "You give clear, accurate, and insightful responses. "
            "When writing code, provide clean, idiomatic code with clear explanations. Format responses using Markdown."
        ),
        "model_name": os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        "temperature": "0.7",
    }

    now = datetime.now(timezone.utc).isoformat()
    for key, val in default_settings.items():
        cursor.execute("""
            INSERT OR IGNORE INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
        """, (key, val, now))

    conn.commit()
    conn.close()


# ==============================================================================
# Conversations CRUD
# ==============================================================================

def create_conversation(title: str = "New Chat", system_prompt: Optional[str] = None) -> Dict[str, Any]:
    conv_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO conversations (id, title, system_prompt, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
    """, (conv_id, title, system_prompt, now, now))
    conn.commit()
    conn.close()
    return {
        "id": conv_id,
        "title": title,
        "system_prompt": system_prompt,
        "created_at": now,
        "updated_at": now,
        "message_count": 0,
    }


def list_conversations() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.*, COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON c.id = m.conversation_id
        GROUP BY c.id
        ORDER BY c.updated_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_conversation(conv_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_conversation(conv_id: str, title: Optional[str] = None, system_prompt: Optional[str] = None) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    
    updates = []
    params = []
    if title is not None:
        updates.append("title = ?")
        params.append(title)
    if system_prompt is not None:
        updates.append("system_prompt = ?")
        params.append(system_prompt)
    
    if not updates:
        conn.close()
        return get_conversation(conv_id)
        
    updates.append("updated_at = ?")
    params.append(now)
    params.append(conv_id)
    
    cursor.execute(f"UPDATE conversations SET {', '.join(updates)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return get_conversation(conv_id)


def delete_conversation(conv_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    # Delete dependent chunks and documents first if needed
    cursor.execute("DELETE FROM document_chunks WHERE conversation_id = ?", (conv_id,))
    cursor.execute("DELETE FROM documents WHERE conversation_id = ?", (conv_id,))
    cursor.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
    cursor.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ==============================================================================
# Messages CRUD
# ==============================================================================

def add_message(
    conversation_id: str,
    role: str,
    content: str,
    files_meta: Optional[List[Dict[str, Any]]] = None,
    custom_id: Optional[str] = None
) -> Dict[str, Any]:
    msg_id = custom_id or str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()

    files_json = json.dumps(files_meta) if files_meta else None

    cursor.execute("""
        INSERT INTO messages (id, conversation_id, role, content, files_meta, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (msg_id, conversation_id, role, content, files_json, now))

    # Touch conversation updated_at
    cursor.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id))

    conn.commit()
    conn.close()

    return {
        "id": msg_id,
        "conversation_id": conversation_id,
        "role": role,
        "content": content,
        "files": files_meta or [],
        "created_at": now
    }


def update_message(msg_id: str, content: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE messages SET content = ? WHERE id = ?", (content, msg_id))
    conn.commit()
    cursor.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    res = dict(row)
    res["files"] = json.loads(res["files_meta"]) if res.get("files_meta") else []
    return res


def get_messages(conversation_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
    """, (conversation_id,))
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        d = dict(r)
        d["files"] = json.loads(d["files_meta"]) if d.get("files_meta") else []
        result.append(d)
    return result


def delete_messages_from(conversation_id: str, message_id: str, inclusive: bool = True) -> int:
    """
    Deletes all messages in a conversation from a given message onwards (used for edit-message & regenerate).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT created_at FROM messages WHERE id = ? AND conversation_id = ?", (message_id, conversation_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return 0

    target_time = row["created_at"]
    op = ">=" if inclusive else ">"
    cursor.execute(f"DELETE FROM messages WHERE conversation_id = ? AND created_at {op} ?", (conversation_id, target_time))
    deleted_count = cursor.rowcount

    # Update conversation updated_at
    now = datetime.now(timezone.utc).isoformat()
    cursor.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id))

    conn.commit()
    conn.close()
    return deleted_count


def delete_last_assistant_message(conversation_id: str) -> Optional[Dict[str, Any]]:
    """Finds and deletes the latest assistant message, returning it."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM messages
        WHERE conversation_id = ? AND role = 'assistant'
        ORDER BY created_at DESC
        LIMIT 1
    """, (conversation_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None

    msg_id = row["id"]
    cursor.execute("DELETE FROM messages WHERE id = ?", (msg_id,))
    conn.commit()
    conn.close()
    return dict(row)


# ==============================================================================
# Documents & Chunks (RAG)
# ==============================================================================

def add_document(
    conversation_id: str,
    filename: str,
    file_type: str,
    file_size: int,
    chunks: List[str]
) -> Dict[str, Any]:
    doc_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO documents (id, conversation_id, filename, file_type, file_size, chunk_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (doc_id, conversation_id, filename, file_type, file_size, len(chunks), now))

    for idx, chunk_text in enumerate(chunks):
        chunk_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO document_chunks (id, document_id, conversation_id, chunk_index, content)
            VALUES (?, ?, ?, ?, ?)
        """, (chunk_id, doc_id, conversation_id, idx, chunk_text))

    conn.commit()
    conn.close()

    return {
        "id": doc_id,
        "conversation_id": conversation_id,
        "filename": filename,
        "file_type": file_type,
        "file_size": file_size,
        "chunk_count": len(chunks),
        "created_at": now
    }


def list_documents(conversation_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM documents
        WHERE conversation_id = ?
        ORDER BY created_at DESC
    """, (conversation_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_conversation_chunks(conversation_id: str) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT dc.id, dc.document_id, dc.chunk_index, dc.content, d.filename
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE dc.conversation_id = ?
        ORDER BY dc.document_id, dc.chunk_index
    """, (conversation_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_document(doc_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM document_chunks WHERE document_id = ?", (doc_id,))
    cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# ==============================================================================
# Persistent User Memories (Cross-Chat Facts)
# ==============================================================================

def add_memory(content: str) -> Dict[str, Any]:
    mem_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO user_memories (id, content, created_at)
        VALUES (?, ?, ?)
    """, (mem_id, content.strip(), now))
    conn.commit()
    conn.close()
    return {
        "id": mem_id,
        "content": content.strip(),
        "created_at": now
    }


def list_memories() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM user_memories ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def delete_memory(memory_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM user_memories WHERE id = ?", (memory_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


def clear_all_memories() -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM user_memories")
    count = cursor.rowcount
    conn.commit()
    conn.close()
    return count


# ==============================================================================
# Settings
# ==============================================================================

def get_settings() -> Dict[str, str]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    rows = cursor.fetchall()
    conn.close()
    res = {row["key"]: row["value"] for row in rows}
    return res


def update_settings(updates: Dict[str, str]) -> Dict[str, str]:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()
    for k, v in updates.items():
        cursor.execute("""
            INSERT INTO settings (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """, (k, str(v), now))
    conn.commit()
    conn.close()
    return get_settings()

