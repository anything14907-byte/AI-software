"""
Google Gemini API Service.
Handles SSE streaming requests, message format translation, error classification,
and model configuration with Google Gemini API (v1beta).
"""

import os
import json
import logging
from typing import List, Dict, Any, AsyncIterator, Optional
import httpx

logger = logging.getLogger("gemini_service")

# Default Gemini Model
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class GeminiAPIError(Exception):
    """Custom exception for Gemini API errors with user-friendly messages."""
    def __init__(self, message: str, status_code: int = 400, error_type: str = "api_error"):
        self.message = message
        self.status_code = status_code
        self.error_type = error_type
        super().__init__(self.message)


def get_api_key(override_key: Optional[str] = None) -> str:
    """Retrieves API key from override parameter, environment variable, or settings."""
    if override_key and override_key.strip():
        return override_key.strip()
    key = os.getenv("GEMINI_API_KEY", "").strip()
    return key


def format_messages_for_gemini(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Converts database messages to Gemini API contents structure:
    [{'role': 'user'|'model', 'parts': [{'text': '...'}]}]
    Also consolidates consecutive messages with the same role to satisfy Gemini's strict turn requirements.
    """
    gemini_contents: List[Dict[str, Any]] = []

    for msg in messages:
        role = msg.get("role", "user")
        if role == "assistant":
            gemini_role = "model"
        elif role == "system":
            # System messages are handled via system_instruction, skip here
            continue
        else:
            gemini_role = "user"

        content = msg.get("content", "").strip()
        if not content:
            continue

        # If previous message had the same role, merge parts
        if gemini_contents and gemini_contents[-1]["role"] == gemini_role:
            gemini_contents[-1]["parts"][0]["text"] += f"\n\n{content}"
        else:
            gemini_contents.append({
                "role": gemini_role,
                "parts": [{"text": content}]
            })

    # Gemini requires the first turn to be 'user'
    if gemini_contents and gemini_contents[0]["role"] != "user":
        gemini_contents.insert(0, {
            "role": "user",
            "parts": [{"text": "Hello"}]
        })

    return gemini_contents


async def stream_gemini_response(
    messages: List[Dict[str, Any]],
    system_instruction: Optional[str] = None,
    model_name: Optional[str] = None,
    temperature: float = 0.7,
    api_key_override: Optional[str] = None
) -> AsyncIterator[str]:
    """
    Streams response from Gemini API using Server-Sent Events (SSE).
    Yields chunks of generated text as they arrive.
    """
    api_key = get_api_key(api_key_override)
    if not api_key:
        raise GeminiAPIError(
            "Gemini API key is missing. Please set GEMINI_API_KEY in your backend/.env file "
            "or enter your API key in Settings (⚙️). You can get a free key at https://aistudio.google.com/app/apikey.",
            status_code=401,
            error_type="missing_api_key"
        )

    model = model_name or os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
    url = f"{GEMINI_BASE_URL}/models/{model}:streamGenerateContent?alt=sse&key={api_key}"

    gemini_contents = format_messages_for_gemini(messages)
    if not gemini_contents:
        raise GeminiAPIError("Cannot generate response: message list is empty.", status_code=400)

    payload: Dict[str, Any] = {
        "contents": gemini_contents,
        "generationConfig": {
            "temperature": max(0.0, min(float(temperature), 2.0)),
            "maxOutputTokens": 8192,
        }
    }

    if system_instruction and system_instruction.strip():
        payload["system_instruction"] = {
            "parts": [{"text": system_instruction.strip()}]
        }

    headers = {"Content-Type": "application/json"}

    try:
        # Use httpx with SSE streaming
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    error_body = error_text.decode("utf-8", errors="replace")
                    
                    try:
                        err_json = json.loads(error_body)
                        err_detail = err_json.get("error", {}).get("message", error_body)
                        err_status = err_json.get("error", {}).get("status", "")
                    except Exception:
                        err_detail = error_body
                        err_status = ""

                    # Helpful error mapping
                    if response.status_code in (401, 403) or "API_KEY_INVALID" in err_detail or "key not valid" in err_detail.lower():
                        raise GeminiAPIError(
                            "Invalid Gemini API key. Please check that your key is correct at https://aistudio.google.com/app/apikey.",
                            status_code=401,
                            error_type="invalid_api_key"
                        )
                    elif response.status_code == 429 or "RESOURCE_EXHAUSTED" in err_status or "quota" in err_detail.lower():
                        raise GeminiAPIError(
                            "Google Gemini rate limit or quota exceeded. Please wait a moment and try again.",
                            status_code=429,
                            error_type="rate_limited"
                        )
                    elif response.status_code == 404 or "not found" in err_detail.lower():
                        raise GeminiAPIError(
                            f"Model '{model}' was not found or is unavailable with your API key. Try switching to 'gemini-2.5-flash' in Settings.",
                            status_code=404,
                            error_type="model_not_found"
                        )
                    else:
                        raise GeminiAPIError(
                            f"Gemini API error ({response.status_code}): {err_detail}",
                            status_code=response.status_code,
                            error_type="upstream_error"
                        )

                # Process SSE lines
                buffer = ""
                async for chunk in response.aiter_text():
                    buffer += chunk
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if not line or line.startswith(":"):
                            continue
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                data_obj = json.loads(data_str)
                                candidates = data_obj.get("candidates", [])
                                if candidates:
                                    parts = candidates[0].get("content", {}).get("parts", [])
                                    for part in parts:
                                        text_piece = part.get("text", "")
                                        if text_piece:
                                            yield text_piece
                            except json.JSONDecodeError:
                                continue

    except httpx.ConnectError:
        raise GeminiAPIError(
            "Could not connect to Google Gemini API. Please check your internet connection.",
            status_code=503,
            error_type="network_error"
        )
    except httpx.TimeoutException:
        raise GeminiAPIError(
            "Google Gemini API request timed out. Please try again.",
            status_code=504,
            error_type="timeout"
        )
    except GeminiAPIError:
        raise
    except Exception as e:
        logger.exception("Unexpected error during Gemini stream")
        raise GeminiAPIError(f"Unexpected error: {str(e)}", status_code=500, error_type="server_error")


async def generate_chat_title(first_prompt: str, api_key_override: Optional[str] = None) -> str:
    """
    Generates a brief 3-5 word title for the conversation using Gemini,
    with a graceful fallback if the API is unreachable or key is not set.
    """
    fallback_title = first_prompt.strip()[:40] + ("..." if len(first_prompt.strip()) > 40 else "")
    if not fallback_title:
        return "New Chat"

    api_key = get_api_key(api_key_override)
    if not api_key:
        return fallback_title

    url = f"{GEMINI_BASE_URL}/models/{DEFAULT_MODEL}:generateContent?key={api_key}"
    payload = {
        "contents": [{
            "role": "user",
            "parts": [{
                "text": (
                    f"Create a concise, punchy 3-5 word title for a chat that starts with: '{first_prompt[:300]}'. "
                    "Return ONLY the title without quotes, punctuation at the end, or markdown."
                )
            }]
        }],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 30}
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                title_candidate = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                title_candidate = title_candidate.replace('"', '').replace("'", '').strip()
                if title_candidate:
                    return title_candidate[:50]
    except Exception:
        pass

    return fallback_title


async def check_api_health(api_key_override: Optional[str] = None) -> Dict[str, Any]:
    """
    Validates the Gemini API key against the models list endpoint.
    """
    api_key = get_api_key(api_key_override)
    if not api_key:
        return {
            "status": "missing_key",
            "configured": False,
            "message": "No API key configured. Please set GEMINI_API_KEY in backend/.env or enter it in Settings."
        }

    url = f"{GEMINI_BASE_URL}/models?key={api_key}"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                model_names = [m.get("name", "").replace("models/", "") for m in data.get("models", [])]
                return {
                    "status": "ok",
                    "configured": True,
                    "available_models": [m for m in model_names if "gemini" in m][:10],
                    "message": "Gemini API connection healthy."
                }
            elif resp.status_code in (401, 403):
                return {
                    "status": "invalid_key",
                    "configured": False,
                    "message": "The configured Gemini API key is invalid or lacks permissions."
                }
            else:
                return {
                    "status": "error",
                    "configured": False,
                    "message": f"Gemini API returned status code {resp.status_code}"
                }
    except Exception as e:
        return {
            "status": "network_error",
            "configured": False,
            "message": f"Network check failed: {str(e)}"
        }

