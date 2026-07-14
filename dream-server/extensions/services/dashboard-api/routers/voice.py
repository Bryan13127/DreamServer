"""Voice API endpoints: status, transcribe, chat, speak."""

import logging

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from security import verify_api_key

logger = logging.getLogger(__name__)

router = APIRouter(tags=["voice"])


def _svc_url(service_id: str) -> str:
    """Build the internal Docker-network URL for a service."""
    from config import SERVICES
    cfg = SERVICES.get(service_id, {})
    host = cfg.get("host", service_id)
    port = cfg.get("port", 0)
    if not port:
        raise HTTPException(status_code=503, detail=f"Service '{service_id}' not configured")
    return f"http://{host}:{port}"


@router.get("/api/voice/status")
async def voice_status(api_key: str = Depends(verify_api_key)):
    """Return voice services availability status."""
    from helpers import check_service_health
    from config import SERVICES

    services_status = {}
    for svc_key, display_name in [("whisper", "stt"), ("tts", "tts")]:
        cfg = SERVICES.get(svc_key)
        if cfg:
            try:
                result = await check_service_health(svc_key, cfg)
                services_status[display_name] = {"status": result.status}
            except Exception:
                logger.warning("Health check failed for %s", svc_key)
                services_status[display_name] = {"status": "unavailable"}
        else:
            services_status[display_name] = {"status": "not_configured"}

    all_healthy = all(s.get("status") == "healthy" for s in services_status.values())

    return {
        "available": all_healthy,
        "services": services_status,
        "message": "All voice services operational" if all_healthy else "Some voice services unavailable",
    }


@router.post("/api/voice/transcribe")
async def voice_transcribe(
    file: UploadFile = File(...),
    api_key: str = Depends(verify_api_key),
):
    """Transcribe audio using Whisper (STT).

    Receives an audio file and forwards it to the Whisper service using
    the OpenAI-compatible /v1/audio/transcriptions endpoint.
    Returns {"text": "<transcript>"}.
    """
    whisper_url = _svc_url("whisper")
    audio_bytes = await file.read()

    timeout = aiohttp.ClientTimeout(total=60)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        form = aiohttp.FormData()
        form.add_field(
            "file",
            audio_bytes,
            filename=file.filename or "audio.webm",
            content_type=file.content_type or "audio/webm",
        )
        form.add_field("model", "Systran/faster-whisper-small")
        form.add_field("response_format", "json")

        async with session.post(f"{whisper_url}/v1/audio/transcriptions", data=form) as resp:
            if resp.status != 200:
                body = await resp.text()
                logger.error("Whisper returned %s: %s", resp.status, body)
                raise HTTPException(status_code=502, detail="Whisper transcription failed")
            data = await resp.json()

    return {"text": data.get("text", "")}


class ChatRequest(BaseModel):
    messages: list[dict]
    model: str = ""


@router.post("/api/voice/chat")
async def voice_chat(
    body: ChatRequest,
    api_key: str = Depends(verify_api_key),
):
    """Get an AI response via LiteLLM.

    Forwards the conversation history to LiteLLM's /v1/chat/completions
    endpoint and returns the assistant reply as {"response": "<text>"}.
    """
    litellm_url = _svc_url("litellm")

    chat_payload: dict = {"messages": body.messages, "stream": False}
    if body.model:
        chat_payload["model"] = body.model

    timeout = aiohttp.ClientTimeout(total=120)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(
            f"{litellm_url}/v1/chat/completions",
            json=chat_payload,
        ) as resp:
            if resp.status != 200:
                error_text = await resp.text()
                logger.error("LiteLLM returned %s: %s", resp.status, error_text)
                raise HTTPException(status_code=502, detail="LLM request failed")
            data = await resp.json()

    choices = data.get("choices")
    if not choices:
        raise HTTPException(status_code=502, detail="LLM returned no choices")
    reply = choices[0].get("message", {}).get("content")
    if reply is None:
        raise HTTPException(status_code=502, detail="LLM response missing content")
    return {"response": reply}


class SpeakRequest(BaseModel):
    text: str
    voice: str = "af_heart"
    speed: float = 1.0


@router.post("/api/voice/speak")
async def voice_speak(
    body: SpeakRequest,
    api_key: str = Depends(verify_api_key),
):
    """Synthesise speech using Kokoro (TTS).

    Forwards the text to Kokoro's OpenAI-compatible /v1/audio/speech
    endpoint and streams the resulting audio back to the browser.
    """
    tts_url = _svc_url("tts")

    tts_payload = {
        "model": "kokoro",
        "input": body.text,
        "voice": body.voice,
        "speed": body.speed,
        "response_format": "mp3",
    }

    timeout = aiohttp.ClientTimeout(total=60)

    async def audio_stream():
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(f"{tts_url}/v1/audio/speech", json=tts_payload) as resp:
                if resp.status != 200:
                    error_body = await resp.text()
                    logger.error("Kokoro returned %s: %s", resp.status, error_body)
                    return
                async for chunk in resp.content.iter_chunked(8192):
                    yield chunk

    return StreamingResponse(audio_stream(), media_type="audio/mpeg")
