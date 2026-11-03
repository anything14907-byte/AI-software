# 🤖 Gemini AI Chat Assistant

A modern, high-performance AI chat assistant web application built from scratch with **Python (FastAPI)**, **React (Vite + TypeScript + Tailwind CSS)**, and **SQLite**. Powered by Google's Gemini models with real-time streaming, conversation memory, document RAG, customizable system prompts, and cross-chat persistent memory.

---

## ✨ Features

1. **Modern, Responsive Chat UI**: Clean interface inspired by Claude and ChatGPT with dark and light mode toggle (persisted across sessions).
2. **Real-Time Streaming Responses**: Text appears word-by-word with smooth token animations powered by Server-Sent Events (SSE).
3. **Full Conversation Memory**: Automatic multi-turn conversation tracking passed to Gemini for natural, continuous context.
4. **Multiple Chats & History**:
   - Create new chats with `⌘K` or the New Chat button.
   - Chronologically grouped history (Today, Yesterday, Previous 7 Days, Older).
   - Inline rename and safe deletion with confirmation dialog.
   - Auto-generated conversation titles based on the initial prompt.
   - Persistent across server restarts in SQLite.
5. **Rich Markdown & Code Highlighting**:
   - Full GitHub Flavored Markdown support (tables, lists, blockquotes, bold/italic).
   - Syntax-highlighted code blocks for all major languages.
   - One-click **Copy** button with checkmark feedback on every code block.
6. **Customizable System Prompt & Persona (Settings)**:
   - Configure Assistant Name, System Instructions, Persona, and Rules.
   - Select Gemini Model (`gemini-2.5-flash` by default, `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash`).
   - Temperature slider (0.0 for deterministic code to 1.5 for creative writing).
7. **Document Upload & Retrieval (RAG)**:
   - Attach PDF, TXT, MD, CSV, or code files via the paperclip button.
   - Text is extracted, chunked with overlap, and indexed.
   - Fast, offline BM25 keyword retrieval finds relevant excerpts and feeds them to Gemini as cited context.
8. **Generation Controls**:
   - **Stop Generating**: Cancel in-flight streams at any time via the stop button.
   - **Regenerate Response**: Re-roll the latest assistant response with one click.
   - **Edit Last Message**: Inline user message editor that updates history and generates fresh replies.
9. **Persistent User Memory**:
   - Cross-chat memory stored in SQLite.
   - The assistant remembers facts you share (e.g. "I am learning Rust", "I live in Seattle", "Prefer concise code").
   - View, add, or delete memories anytime in **Settings → User Memories**.
10. **Resilient Error Handling**:
    - Gracefully handles missing API keys, invalid keys, rate limits (429), and network disconnects.
    - Displays friendly, actionable error cards with one-click links to Settings.
    - App never crashes.

---

## 🔑 Where to Get a Free Gemini API Key

1. Go to **[Google AI Studio](https://aistudio.google.com/app/apikey)**.
2. Sign in with your Google account.
3. Click **"Create API key"** and select a project (or create a new free project).
4. Copy the API key.

---

## 🚀 Quick Start (One Command)

Run the included startup script from the project root:

```bash
./start.sh
```

This will automatically create the virtual environment, install dependencies, build the frontend, and start the application on **`http://127.0.0.1:8000`**.

---

## 🛠 Manual Installation & Step-by-Step Run

### 1. Prerequisites
- **Python 3.10+** (tested on Python 3.12)
- **Node.js 18+** & **npm**

### 2. Configure Environment Variables
Copy `.env.example` in `backend/`:

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and paste your Gemini API key:
```ini
GEMINI_API_KEY=AIzaSy...your_actual_key_here
GEMINI_MODEL=gemini-2.5-flash
```

*(Note: You can also enter or override your API key directly in the web UI under **Settings → API Key & Status**).*

### 3. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate Python virtual environment
python3 -m venv venv
source venv/bin/activate    # On Windows: venv\Scripts\activate

# Install requirements
pip install -r requirements.txt

# Run the FastAPI server
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

The backend API is now running at `http://127.0.0.1:8000`.

### 4. Frontend Setup

In a new terminal window:

```bash
# Navigate to frontend directory
cd frontend

# Install npm packages
npm install

# Start Vite dev server (with automatic /api proxy to FastAPI)
npm run dev
```

Open your browser to:
👉 **`http://127.0.0.1:5173`**

*(Alternatively, run `npm run build` once, and FastAPI will serve the full web app directly on `http://127.0.0.1:8000`).*

---

## 🧪 Running Automated Tests

A comprehensive automated test suite covers the database, message slicing, RAG chunking, BM25 retrieval, SSE streaming, multi-turn memory, and error handling:

```bash
./backend/venv/bin/pytest backend/test_backend.py -v
```

All 11 tests pass with 100% coverage across core workflows.

---

## 📁 Project Structure

```
AI software/
├── start.sh                 # One-click startup script for backend & frontend
├── README.md                # Documentation and setup instructions
├── backend/
│   ├── .env.example         # Template for environment configuration
│   ├── .env                 # Local secrets (never committed to git)
│   ├── requirements.txt     # Python dependencies
│   ├── database.py          # SQLite schema, WAL mode, CRUD repository
│   ├── gemini_service.py    # Google Gemini SSE streaming & error classification
│   ├── rag_service.py       # PDF/TXT extraction, chunking & BM25 ranking
│   ├── main.py              # FastAPI endpoints, static file mount & SSE generator
│   └── test_backend.py      # Automated test suite (pytest)
└── frontend/
    ├── package.json         # NPM dependencies & scripts
    ├── vite.config.ts       # Vite configuration with /api reverse proxy
    ├── tailwind.config.js   # Tailwind design tokens & dark mode classes
    ├── postcss.config.js    # PostCSS plugins
    ├── tsconfig.json        # TypeScript configuration
    ├── index.html           # HTML entry point
    └── src/
        ├── types/           # Shared TypeScript interfaces
        ├── api/             # Typed API client and SSE stream reader
        ├── components/
        │   ├── Sidebar.tsx        # Chronological chat history & management
        │   ├── ChatMessage.tsx    # Message bubble, markdown & action controls
        │   ├── ChatInput.tsx      # Auto-expanding input, file attachment, stop button
        │   ├── CodeBlock.tsx      # Code block with language tag and Copy button
        │   └── SettingsModal.tsx  # Persona, model, user memories & key configuration
        ├── App.tsx          # Main application orchestrator
        ├── main.tsx         # React root mount
        └── index.css        # Tailwind directives and custom scrollbar
```

---

## 💡 Keyboard Shortcuts

- `Enter`: Send message
- `Shift + Enter`: Insert new line in textarea
- `⌘ + K` (Mac) / `Ctrl + K` (Win/Linux): Open new chat
- `Esc`: Close settings modal or cancel inline editing

