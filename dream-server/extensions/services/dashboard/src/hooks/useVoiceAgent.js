/**
 * useVoiceAgent Hook
 *
 * Manages a hands-free voice conversation loop using a simple HTTP pipeline:
 *   1. MediaRecorder captures microphone audio
 *   2. Audio is sent to /api/voice/transcribe (Whisper STT)
 *   3. Transcript + history are sent to /api/voice/chat (LiteLLM)
 *   4. AI response is sent to /api/voice/speak (Kokoro TTS)
 *   5. Audio is played back; after playback, listening restarts automatically
 *
 * No WebRTC or LiveKit required — all requests go through /api/.
 */

import { useState, useRef, useCallback, useEffect } from 'react'

// Map settings-panel voice names to Kokoro voice IDs
const VOICE_MAP = {
  default: 'af_heart',
  jenny:   'af_sky',
  alan:    'am_adam',
  amy:     'bf_emma',
}

function getVoiceId() {
  const setting = localStorage.getItem('voice-setting') || 'default'
  return VOICE_MAP[setting] || 'af_heart'
}

function getSpeed() {
  return parseFloat(localStorage.getItem('voice-speed') || '1.0')
}

export function useVoiceAgent() {
  const [status, setStatus]                   = useState('disconnected')
  const [isListening, setIsListening]         = useState(false)
  const [isSpeaking, setIsSpeaking]           = useState(false)
  const [messages, setMessages]               = useState([])
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [error, setError]                     = useState(null)
  const [volume, setVolume]                   = useState(1.0)
  const [isMuted, setIsMuted]                 = useState(false)

  // Refs that survive re-renders without triggering them
  const mediaRecorderRef  = useRef(null)
  const audioChunksRef    = useRef([])
  const audioRef          = useRef(null)       // current HTMLAudioElement
  const abortRef          = useRef(null)       // AbortController for in-flight requests
  const messagesRef       = useRef([])         // shadow of messages for callbacks
  const volumeRef         = useRef(1.0)
  const isMutedRef        = useRef(false)
  const isListeningRef    = useRef(false)      // shadow so callbacks read latest value
  const continuousRef     = useRef(false)      // whether to auto-restart after speaking

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { volumeRef.current = volume }, [volume])
  useEffect(() => { isMutedRef.current = isMuted }, [isMuted])
  useEffect(() => { isListeningRef.current = isListening }, [isListening])

  // ── helpers ──────────────────────────────────────────────────────────────

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      URL.revokeObjectURL(audioRef.current.src)
      audioRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  const abortPipeline = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    stopAudio()
  }, [stopAudio])

  // ── speak ─────────────────────────────────────────────────────────────────

  const speak = useCallback(async (text, signal) => {
    setIsSpeaking(true)
    try {
      const response = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: getVoiceId(), speed: getSpeed() }),
        signal,
      })
      if (!response.ok) throw new Error(`TTS failed: ${response.status}`)

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.volume = isMutedRef.current ? 0 : volumeRef.current
      audioRef.current = audio

      await new Promise((resolve, reject) => {
        audio.onended = resolve
        audio.onerror = reject
        audio.play().catch(reject)
      })

      URL.revokeObjectURL(url)
      audioRef.current = null
    } finally {
      setIsSpeaking(false)
    }
  }, [])

  // ── pipeline: transcribe → chat → speak ──────────────────────────────────

  const runPipeline = useCallback(async (audioBlob) => {
    const abort = new AbortController()
    abortRef.current = abort
    const { signal } = abort

    try {
      setStatus('connecting')
      setError(null)

      // 1. Transcribe
      const form = new FormData()
      form.append('file', audioBlob, 'audio.webm')
      const transcribeRes = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: form,
        signal,
      })
      if (!transcribeRes.ok) throw new Error(`Transcription failed: ${transcribeRes.status}`)
      const { text } = await transcribeRes.json()
      if (!text || !text.trim()) {
        setStatus('connected')
        return
      }

      const userMsg = { role: 'user', content: text.trim(), timestamp: Date.now() }
      setMessages(prev => [...prev, userMsg])
      setCurrentTranscript('')

      // 2. Chat
      const history = messagesRef.current.map(m => ({ role: m.role, content: m.content }))
      const chatMessages = [...history, { role: 'user', content: text.trim() }]
      const chatRes = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages }),
        signal,
      })
      if (!chatRes.ok) throw new Error(`Chat failed: ${chatRes.status}`)
      const { response: aiText } = await chatRes.json()

      const assistantMsg = { role: 'assistant', content: aiText, timestamp: Date.now() }
      setMessages(prev => [...prev, assistantMsg])
      setStatus('connected')

      // 3. Speak
      await speak(aiText, signal)

      // Auto-restart listening after speaking (hands-free)
      if (continuousRef.current && !signal.aborted) {
        startListening().catch(err => setError(err.message))
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message)
      setStatus('error')
    }
  }, [speak])

  // ── microphone ────────────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        audioChunksRef.current = []
        runPipeline(blob)
      }

      recorder.start()
      setIsListening(true)
      setStatus('connected')
      setError(null)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [runPipeline])

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    setIsListening(false)
  }, [])

  // ── public API ────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    continuousRef.current = true
    await startListening()
  }, [startListening])

  const disconnect = useCallback(() => {
    continuousRef.current = false
    stopListening()
    abortPipeline()
    setStatus('disconnected')
  }, [stopListening, abortPipeline])

  const toggleListening = useCallback(async () => {
    if (isListeningRef.current) {
      continuousRef.current = false
      stopListening()
    } else {
      abortPipeline()
      continuousRef.current = true
      await startListening()
    }
  }, [startListening, stopListening, abortPipeline])

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev
      isMutedRef.current = next
      if (audioRef.current) audioRef.current.volume = next ? 0 : volumeRef.current
      return next
    })
  }, [])

  const updateVolume = useCallback((newVolume) => {
    setVolume(newVolume)
    volumeRef.current = newVolume
    if (audioRef.current && !isMutedRef.current) audioRef.current.volume = newVolume
  }, [])

  const interrupt = useCallback(() => {
    continuousRef.current = false
    abortPipeline()
    stopListening()
  }, [abortPipeline, stopListening])

  const clearMessages = useCallback(() => setMessages([]), [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      continuousRef.current = false
      stopListening()
      abortPipeline()
    }
  }, [stopListening, abortPipeline])

  return {
    status,
    isListening,
    isSpeaking,
    messages,
    currentTranscript,
    error,
    volume,
    isMuted,
    connect,
    disconnect,
    toggleListening,
    toggleMute,
    updateVolume,
    interrupt,
    clearMessages,
  }
}

export default useVoiceAgent
