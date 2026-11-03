"""
FastAPI application for the AI Chat Assistant.
Handles REST endpoints and Server-Sent Events (SSE) streaming for real-time AI responses.
"""

import os
import json
import logging
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

import database as db
import gemini_service as gemini
import rag_service as rag

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema on startup
    db.init_db()
    logger.info("Database initialized successfully.")
    yield


app = FastAPI(
    title="Gemini AI Chat Assistant API",
    description="High-performance backend for Gemini-powered conversational AI with RAG and persistent memory.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend development and local access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==============================================================================
# Pydantic Request/Response Models
# ==============================================================================

class ConversationCreateRequest(BaseModel):
    title: Optional[str] = "New Chat"
    system_prompt: Optional[str] = None


class ConversationUpdateRequest(BaseModel):
    title: Optional[str] = None
    system_prompt: Optional[str] = None


class ChatStreamRequest(BaseModel):
    conversation_id: str
    message: str = Field(..., min_length=1, description="User message cannot be empty")
    model_name: Optional[str] = None
    temperature: Optional[float] = None
    api_key: Optional[str] = None


class RegenerateRequest(BaseModel):
    model_name: Optional[str] = None
    temperature: Optional[float] = None
    api_key: Optional[str] = None


class EditMessageRequest(BaseModel):
    message_id: str
    new_content: str = Field(..., min_length=1, description="Message content cannot be empty")
    model_name: Optional[str] = None
    temperature: Optional[float] = None
    api_key: Optional[str] = None


class MemoryCreateRequest(BaseModel):
    content: str = Field(..., min_length=1, description="Memory content cannot be empty")


class SettingsUpdateRequest(BaseModel):
    assistant_name: Optional[str] = None
    system_prompt: Optional[str] = None
    model_name: Optional[str] = None
    temperature: Optional[str] = None
    api_key: Optional[str] = None


# ==============================================================================
# Health Check Endpoint
# ==============================================================================

@app.get("/api/health")
async def health_check():
    health_info = await gemini.check_api_health()
    settings = db.get_settings()
    return {
        "status": "healthy",
        "gemini": health_info,
        "default_model": settings.get("model_name", "gemini-2.5-flash"),
        "assistant_name": settings.get("assistant_name", "Gemini Assistant"),
    }


# ==============================================================================
# Conversation Endpoints
# ==============================================================================

@app.get("/api/conversations")
async def list_conversations():
    return db.list_conversations()


@app.post("/api/conversations", status_code=status.HTTP_201_CREATED)
async def create_conversation(req: ConversationCreateRequest):
    return db.create_conversation(title=req.title or "New Chat", system_prompt=req.system_prompt)


@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    conv = db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = db.get_messages(conv_id)
    documents = db.list_documents(conv_id)
    return {
        **conv,
        "messages": messages,
        "documents": documents
    }


@app.patch("/api/conversations/{conv_id}")
async def update_conversation(conv_id: str, req: ConversationUpdateRequest):
    conv = db.update_conversation(conv_id, title=req.title, system_prompt=req.system_prompt)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    success = db.delete_conversation(conv_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"success": True, "message": "Conversation deleted"}


# ==============================================================================
# RAG Document Upload Endpoints
# ==============================================================================

@app.post("/api/conversations/{conv_id}/upload")
async def upload_document(conv_id: str, file: UploadFile = File(...)):
    conv = db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    filename = file.filename or "uploaded_file.txt"
    content_bytes = await file.read()
    file_size = len(content_bytes)

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Max 25 MB limit
    if file_size > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum file size is 25 MB.")

    try:
        extracted_text = rag.extract_text_from_file(filename, content_bytes)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.exception("File extraction failed")
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")

    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="No readable text could be extracted from this file.")

    # Chunk the text
    chunks = rag.chunk_text(extracted_text)
    file_type = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"

    doc = db.add_document(
        conversation_id=conv_id,
        filename=filename,
        file_type=file_type,
        file_size=file_size,
        chunks=chunks
    )

    return {
        "success": True,
        "document": doc,
        "message": f"Successfully processed '{filename}' into {len(chunks)} chunks for retrieval."
    }


@app.get("/api/conversations/{conv_id}/documents")
async def get_conversation_documents(conv_id: str):
    return db.list_documents(conv_id)


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    success = db.delete_document(doc_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"success": True, "message": "Document deleted"}


# ==============================================================================
# Persistent User Memories Endpoints
# ==============================================================================

@app.get("/api/memories")
async def list_memories():
    return db.list_memories()


@app.post("/api/memories", status_code=status.HTTP_201_CREATED)
async def add_memory(req: MemoryCreateRequest):
    return db.add_memory(req.content)


@app.delete("/api/memories/{memory_id}")
async def delete_memory(memory_id: str):
    success = db.delete_memory(memory_id)
    if not success:
        raise HTTPException(status_code=404, detail="Memory not found")
    return {"success": True, "message": "Memory deleted"}


@app.delete("/api/memories")
async def clear_all_memories():
    count = db.clear_all_memories()
    return {"success": True, "deleted_count": count}


# ==============================================================================
# Settings Endpoints
# ==============================================================================

@app.get("/api/settings")
async def get_settings():
    settings = db.get_settings()
    # Mask API key for security if present in env
    has_env_key = bool(os.getenv("GEMINI_API_KEY", "").strip())
    return {
        **settings,
        "has_env_key": has_env_key,
    }


@app.put("/api/settings")
async def update_settings(req: SettingsUpdateRequest):
    updates = {}
    if req.assistant_name is not None:
        updates["assistant_name"] = req.assistant_name
    if req.system_prompt is not None:
        updates["system_prompt"] = req.system_prompt
    if req.model_name is not None:
        updates["model_name"] = req.model_name
    if req.temperature is not None:
        updates["temperature"] = req.temperature
    if req.api_key is not None and req.api_key.strip():
        # Store in settings if provided
        updates["api_key_override"] = req.api_key.strip()

    updated = db.update_settings(updates)
    return updated


# ==============================================================================
# Helper for Building Full Prompt Context
# ==============================================================================

def prepare_system_instruction(conv: Optional[Dict[str, Any]] = None) -> str:
    """
    Combines:
    1. Base system prompt (custom from settings or conversation)
    2. Assistant persona
    3. Persistent user memories across chats
    """
    settings = db.get_settings()
    base_prompt = ""
    if conv and conv.get("system_prompt"):
        base_prompt = conv["system_prompt"]
    else:
        base_prompt = settings.get(
            "system_prompt",
            "You are Gemini Assistant, a helpful, thoughtful, and knowledgeable AI assistant."
        )

    assistant_name = settings.get("assistant_name", "Gemini Assistant")

    instructions = [f"Your name is {assistant_name}.", base_prompt.strip(), ""]

    # Inject persistent user memories
    memories = db.list_memories()
    if memories:
        instructions.append("### Persistent User Information (Remembered Across All Chats):")
        instructions.append("The user has provided the following facts about themselves. Keep them in mind for all answers:")
        for m in memories:
            instructions.append(f"- {m['content']}")
        instructions.append("")

    return "\n".join(instructions).strip()


# ==============================================================================
# Streaming Chat Endpoint (SSE)
# ==============================================================================

async def stream_generator(
    conv_id: str,
    user_prompt: str,
    model_name: Optional[str] = None,
    temperature: Optional[float] = None,
    api_key_override: Optional[str] = None,
    is_regenerate: bool = False
):
    """
    Generator that handles SSE streaming, message persistence, RAG context, and title generation.
    """
    settings = db.get_settings()
    effective_model = model_name or settings.get("model_name", "gemini-2.5-flash")
    effective_temp = float(temperature if temperature is not None else settings.get("temperature", 0.7))
    key_override = api_key_override or settings.get("api_key_override")

    conv = db.get_conversation(conv_id)
    if not conv:
        yield f"data: {json.dumps({'type': 'error', 'error': 'Conversation not found.'})}\n\n"
        return

    # 1. Fetch conversation messages
    existing_messages = db.get_messages(conv_id)

    # 2. RAG Retrieval: Check for uploaded documents
    doc_chunks = db.get_conversation_chunks(conv_id)
    rag_context = ""
    if doc_chunks:
        rag_context = rag.build_rag_context(user_prompt, doc_chunks, top_k=4)

    # 3. Format message history for Gemini
    history_for_gemini: List[Dict[str, Any]] = []
    for m in existing_messages:
        # Don't include the very latest user message yet as we'll format it with RAG context
        history_for_gemini.append({
            "role": m["role"],
            "content": m["content"]
        })

    # If RAG context found, augment the latest user turn
    if rag_context:
        augmented_prompt = f"{rag_context}\n\n**User Question:**\n{user_prompt}"
        if history_for_gemini and history_for_gemini[-1]["role"] == "user":
            history_for_gemini[-1]["content"] = augmented_prompt
        else:
            history_for_gemini.append({"role": "user", "content": augmented_prompt})

    # 4. System instruction with persona & user memories
    system_instruction = prepare_system_instruction(conv)

    # Yield stream start event
    yield f"data: {json.dumps({'type': 'start', 'conversation_id': conv_id})}\n\n"

    full_response_parts: List[str] = []

    try:
        # Stream chunks from Gemini
        async for chunk in gemini.stream_gemini_response(
            messages=history_for_gemini,
            system_instruction=system_instruction,
            model_name=effective_model,
            temperature=effective_temp,
            api_key_override=key_override
        ):
            full_response_parts.append(chunk)
            payload = json.dumps({"type": "chunk", "text": chunk})
            yield f"data: {payload}\n\n"

        full_text = "".join(full_response_parts).strip()

        # Save assistant message to DB
        assistant_msg = db.add_message(
            conversation_id=conv_id,
            role="assistant",
            content=full_text
        )

        # Check if conversation needs an auto-generated title
        # (if title is still 'New Chat' and this was the first user message)
        user_msg_count = sum(1 for m in existing_messages if m["role"] == "user")
        if conv["title"] == "New Chat" and user_msg_count <= 1:
            try:
                new_title = await gemini.generate_chat_title(user_prompt, api_key_override=key_override)
                if new_title and new_title != "New Chat":
                    db.update_conversation(conv_id, title=new_title)
                    yield f"data: {json.dumps({'type': 'title', 'title': new_title})}\n\n"
            except Exception as e:
                logger.warning(f"Failed to auto-generate title: {e}")

        # Yield done event
        yield f"data: {json.dumps({'type': 'done', 'message_id': assistant_msg['id'], 'content': full_text})}\n\n"

    except gemini.GeminiAPIError as ge:
        logger.error(f"Gemini API Error: {ge.message}")
        # If partial content was produced before error, save it
        if full_response_parts:
            partial_text = "".join(full_response_parts)
            db.add_message(conversation_id=conv_id, role="assistant", content=partial_text)
        yield f"data: {json.dumps({'type': 'error', 'error': ge.message, 'error_type': ge.error_type})}\n\n"
    except Exception as e:
        logger.exception("Unexpected error in stream generator")
        yield f"data: {json.dumps({'type': 'error', 'error': f'An unexpected error occurred: {str(e)}', 'error_type': 'server_error'})}\n\n"


@app.post("/api/chat/stream")
async def chat_stream(req: ChatStreamRequest):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    conv = db.get_conversation(req.conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    # Save user message to database
    user_msg = db.add_message(
        conversation_id=req.conversation_id,
        role="user",
        content=req.message.strip()
    )

    return StreamingResponse(
        stream_generator(
            conv_id=req.conversation_id,
            user_prompt=req.message.strip(),
            model_name=req.model_name,
            temperature=req.temperature,
            api_key_override=req.api_key
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.post("/api/conversations/{conv_id}/regenerate")
async def regenerate_response(conv_id: str, req: RegenerateRequest):
    conv = db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    # Delete the last assistant message
    deleted = db.delete_last_assistant_message(conv_id)
    if not deleted:
        raise HTTPException(status_code=400, detail="No assistant message found to regenerate.")

    # Find the preceding user message
    messages = db.get_messages(conv_id)
    if not messages:
        raise HTTPException(status_code=400, detail="No user message found to regenerate.")

    last_user_message = next((m for m in reversed(messages) if m["role"] == "user"), None)
    if not last_user_message:
        raise HTTPException(status_code=400, detail="No user message found to regenerate.")

    return StreamingResponse(
        stream_generator(
            conv_id=conv_id,
            user_prompt=last_user_message["content"],
            model_name=req.model_name,
            temperature=req.temperature,
            api_key_override=req.api_key,
            is_regenerate=True
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.post("/api/conversations/{conv_id}/edit-message")
async def edit_message(conv_id: str, req: EditMessageRequest):
    if not req.new_content.strip():
        raise HTTPException(status_code=400, detail="New message content cannot be empty.")

    conv = db.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    # Delete all messages from this message onwards
    db.delete_messages_from(conv_id, req.message_id, inclusive=True)

    # Insert updated user message
    db.add_message(
        conversation_id=conv_id,
        role="user",
        content=req.new_content.strip(),
        custom_id=req.message_id
    )

    return StreamingResponse(
        stream_generator(
            conv_id=conv_id,
            user_prompt=req.new_content.strip(),
            model_name=req.model_name,
            temperature=req.temperature,
            api_key_override=req.api_key
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# Mount frontend static build if present
from fastapi.staticfiles import StaticFiles
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")


# Run server directly if executed
if __name__ == "__main__":

    import uvicorn
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host=host, port=port, reload=True)
