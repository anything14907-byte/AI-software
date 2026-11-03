#!/usr/bin/env bash
# ==============================================================================
# Gemini AI Chat Assistant — One-Click Startup Script
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=================================================="
echo " Starting Gemini AI Chat Assistant"
echo "=================================================="

# Check Python virtual environment
if [ ! -d "backend/venv" ]; then
    echo "Creating Python virtual environment in backend/venv..."
    python3 -m venv backend/venv
    ./backend/venv/bin/pip install --upgrade pip
    ./backend/venv/bin/pip install -r backend/requirements.txt
fi

# Check .env file
if [ ! -f "backend/.env" ]; then
    echo "Creating backend/.env from backend/.env.example..."
    cp backend/.env.example backend/.env
    echo "NOTE: Please add your GEMINI_API_KEY to backend/.env or enter it in Settings (⚙️)."
fi

# Build frontend if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
    echo "Building frontend..."
    cd frontend
    npm install
    npm run build
    cd "$DIR"
fi

echo ""
echo "🚀 Launching unified application server on http://127.0.0.1:8000"
echo "   (Frontend UI + FastAPI Backend running on single port)"
echo ""
echo "Press Ctrl+C to stop the server."
echo ""

cd backend
./venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload

