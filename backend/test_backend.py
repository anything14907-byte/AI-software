"""
Automated tests for Backend API, Database, RAG service, and Error Handling.
"""

import os
import io
import pytest
from fastapi.testclient import TestClient

# Set testing environment before importing database or main
os.environ["GEMINI_MODEL"] = "gemini-2.5-flash"
import database as db
import gemini_service as gemini
from main import app
import rag_service as rag


client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_and_teardown():
    """Ensure clean database for each test run."""
    db.init_db()
    yield


def test_database_conversation_crud():
    # Create conversation
    conv = db.create_conversation("Test Chat")
    assert conv["id"] is not None
    assert conv["title"] == "Test Chat"

    # Get conversation
    fetched = db.get_conversation(conv["id"])
    assert fetched["id"] == conv["id"]

    # Update conversation
    updated = db.update_conversation(conv["id"], title="Renamed Chat")
    assert updated["title"] == "Renamed Chat"

    # List conversations
    convs = db.list_conversations()
    assert any(c["id"] == conv["id"] for c in convs)

    # Delete conversation
    deleted = db.delete_conversation(conv["id"])
    assert deleted is True
    assert db.get_conversation(conv["id"]) is None


def test_database_messages_and_edit_flow():
    conv = db.create_conversation("Flow Chat")
    conv_id = conv["id"]

    # Add messages
    m1 = db.add_message(conv_id, "user", "Hello assistant")
    m2 = db.add_message(conv_id, "assistant", "Hello! How can I help you today?")
    m3 = db.add_message(conv_id, "user", "Tell me a joke")
    m4 = db.add_message(conv_id, "assistant", "Why do programmers prefer dark mode? Because light attracts bugs.")

    messages = db.get_messages(conv_id)
    assert len(messages) == 4

    # Test delete last assistant message (Regenerate flow)
    last_deleted = db.delete_last_assistant_message(conv_id)
    assert last_deleted["id"] == m4["id"]
    messages_after_regen = db.get_messages(conv_id)
    assert len(messages_after_regen) == 3
    assert messages_after_regen[-1]["id"] == m3["id"]

    # Test delete from message onwards (Edit flow)
    # Deleting from m3 onwards leaves m1 and m2
    db.delete_messages_from(conv_id, m3["id"], inclusive=True)
    messages_after_edit = db.get_messages(conv_id)
    assert len(messages_after_edit) == 2
    assert messages_after_edit[-1]["id"] == m2["id"]

    db.delete_conversation(conv_id)


def test_user_memories_crud():
    # Clear existing
    db.clear_all_memories()

    mem1 = db.add_memory("User prefers TypeScript and dark theme.")
    mem2 = db.add_memory("User lives in San Francisco.")

    memories = db.list_memories()
    assert len(memories) == 2
    contents = [m["content"] for m in memories]
    assert "User prefers TypeScript and dark theme." in contents
    assert "User lives in San Francisco." in contents

    # Delete memory
    db.delete_memory(mem1["id"])
    memories_after = db.list_memories()
    assert len(memories_after) == 1
    assert memories_after[0]["id"] == mem2["id"]

    # Clear all
    db.clear_all_memories()
    assert len(db.list_memories()) == 0


def test_settings_get_and_update():
    settings = db.get_settings()
    assert "assistant_name" in settings
    assert "model_name" in settings

    # Update settings
    updated = db.update_settings({"assistant_name": "Antigravity AI", "temperature": "0.9"})
    assert updated["assistant_name"] == "Antigravity AI"
    assert updated["temperature"] == "0.9"


def test_rag_chunking_and_bm25_retrieval():
    sample_text = (
        "Quantum computing is a rapidly-emerging technology that harnesses the laws of quantum mechanics "
        "to solve problems too complex for classical computers. Today, IBM Quantum hardware is accessible "
        "to thousands of developers.\n\n"
        "Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy. "
        "This chemical energy is stored in carbohydrate molecules, such as sugars and starches.\n\n"
        "FastAPI is a modern, fast (high-performance), web framework for building APIs with Python 3.8+ based on "
        "standard Python type hints."
    )

    chunks = rag.chunk_text(sample_text, chunk_size=200, chunk_overlap=30)
    assert len(chunks) >= 3

    chunk_objects = [{"content": c, "filename": "sample.txt", "chunk_index": i} for i, c in enumerate(chunks)]

    # Query about photosynthesis
    context = rag.build_rag_context("How do plants convert light energy into chemical energy?", chunk_objects)
    assert "Photosynthesis" in context
    assert "sample.txt" in context


def test_api_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "gemini" in data


def test_api_conversations_endpoints():
    # Create conversation
    res = client.post("/api/conversations", json={"title": "FastAPI Chat"})
    assert res.status_code == 201
    conv = res.json()
    conv_id = conv["id"]

    # Get conversation
    res_get = client.get(f"/api/conversations/{conv_id}")
    assert res_get.status_code == 200
    assert res_get.json()["title"] == "FastAPI Chat"

    # Patch conversation title
    res_patch = client.patch(f"/api/conversations/{conv_id}", json={"title": "Updated Title"})
    assert res_patch.status_code == 200
    assert res_patch.json()["title"] == "Updated Title"

    # Delete conversation
    res_del = client.delete(f"/api/conversations/{conv_id}")
    assert res_del.status_code == 200


def test_api_upload_text_file():
    # Create conversation
    res = client.post("/api/conversations", json={"title": "Upload Chat"})
    conv_id = res.json()["id"]

    file_content = b"This is a test document explaining the architecture of React and FastAPI applications."
    res_upload = client.post(
        f"/api/conversations/{conv_id}/upload",
        files={"file": ("test_doc.txt", io.BytesIO(file_content), "text/plain")}
    )
    assert res_upload.status_code == 200
    upload_data = res_upload.json()
    assert upload_data["success"] is True
    assert upload_data["document"]["filename"] == "test_doc.txt"
    assert upload_data["document"]["chunk_count"] > 0

    # Clean up
    client.delete(f"/api/conversations/{conv_id}")


def test_frontend_static_serving():
    res = client.get("/")
    assert res.status_code == 200
    assert "<!doctype html>" in res.text.lower()
    assert "Gemini Assistant" in res.text

    # Empty message should be rejected with 422 or 400
    res = client.post("/api/chat/stream", json={"conversation_id": "test", "message": "   "})
    assert res.status_code in (400, 422)


def test_api_stream_missing_api_key_friendly_error():
    # When API key is not set, streaming should return a clean SSE error event, not a 500 crash
    conv = db.create_conversation("Key Test")
    conv_id = conv["id"]

    # Temporarily ensure no key is in settings
    db.update_settings({"api_key_override": ""})
    original_env_key = os.environ.get("GEMINI_API_KEY", "")
    os.environ["GEMINI_API_KEY"] = ""

    try:
        response = client.post(
            "/api/chat/stream",
            json={"conversation_id": conv_id, "message": "Hello without key", "api_key": ""}
        )
        assert response.status_code == 200
        content = response.text
        assert "data: " in content
        assert "missing_api_key" in content or "Gemini API key is missing" in content
    finally:
        os.environ["GEMINI_API_KEY"] = original_env_key
        db.delete_conversation(conv_id)


def test_api_stream_full_conversation_memory_and_rag(monkeypatch):
    """
    Tests streaming, title auto-generation, conversation memory across turns,
    and RAG document context injection.
    """
    conv = db.create_conversation("New Chat")
    conv_id = conv["id"]

    # 1. Add persistent memory
    db.clear_all_memories()
    db.add_memory("User prefers dark mode and Python.")

    # 2. Upload sample document
    chunks = ["The orbital altitude of StarStation Alpha is 420 kilometers."]
    db.add_document(conv_id, "station_manual.txt", "txt", 100, chunks)

    # 3. Mock Gemini streaming and title generation
    async def mock_stream_response(messages, system_instruction=None, model_name=None, temperature=0.7, api_key_override=None):
        # Assert memory is in system instruction
        assert "User prefers dark mode and Python" in system_instruction
        # Assert RAG context is in user prompt
        last_user_msg = messages[-1]["content"]
        assert "StarStation Alpha" in last_user_msg or "420 kilometers" in last_user_msg

        yield "The orbital "
        yield "altitude is "
        yield "420 kilometers."

    async def mock_title_generation(first_prompt, api_key_override=None):
        return "StarStation Orbit Chat"

    monkeypatch.setattr("main.gemini.stream_gemini_response", mock_stream_response)
    monkeypatch.setattr("main.gemini.generate_chat_title", mock_title_generation)


    # Call streaming endpoint
    res = client.post(
        "/api/chat/stream",
        json={"conversation_id": conv_id, "message": "What is the orbital altitude of StarStation Alpha?", "api_key": "test_key"}
    )
    assert res.status_code == 200
    content = res.text
    assert '"type": "chunk"' in content
    assert '"text": "The orbital "' in content
    assert '"type": "title"' in content
    assert '"title": "StarStation Orbit Chat"' in content
    assert '"type": "done"' in content

    # Verify conversation title was updated in database
    updated_conv = db.get_conversation(conv_id)
    assert updated_conv["title"] == "StarStation Orbit Chat"

    # Verify assistant message was saved to database
    messages = db.get_messages(conv_id)
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "assistant"
    assert messages[1]["content"] == "The orbital altitude is 420 kilometers."

    # Test Turn 2 (Conversation Memory):
    # Second turn should include earlier messages
    async def mock_stream_turn_2(messages, system_instruction=None, model_name=None, temperature=0.7, api_key_override=None):
        # Verify turn 1 is in history
        assert len(messages) >= 3
        assert messages[0]["content"] == "What is the orbital altitude of StarStation Alpha?"
        assert messages[1]["content"] == "The orbital altitude is 420 kilometers."
        yield "That is correct in Low Earth Orbit."

    monkeypatch.setattr("main.gemini.stream_gemini_response", mock_stream_turn_2)


    res2 = client.post(
        "/api/chat/stream",
        json={"conversation_id": conv_id, "message": "Is that considered low earth orbit?", "api_key": "test_key"}
    )
    assert res2.status_code == 200
    assert "Low Earth Orbit" in res2.text

    # Verify DB now has 4 messages
    all_msgs = db.get_messages(conv_id)
    assert len(all_msgs) == 4

    # Test Regenerate Turn
    async def mock_stream_regen(messages, system_instruction=None, model_name=None, temperature=0.7, api_key_override=None):
        yield "Yes, 420 km is standard LEO."

    monkeypatch.setattr("main.gemini.stream_gemini_response", mock_stream_regen)


    res_regen = client.post(f"/api/conversations/{conv_id}/regenerate", json={"api_key": "test_key"})
    assert res_regen.status_code == 200
    assert "standard LEO" in res_regen.text

    # After regenerate, message count should still be 4 with new content
    msgs_after_regen = db.get_messages(conv_id)
    assert len(msgs_after_regen) == 4
    assert msgs_after_regen[-1]["content"] == "Yes, 420 km is standard LEO."

    db.delete_conversation(conv_id)


