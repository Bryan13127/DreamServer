/**
 * useVoiceAgent Hook
 * 
 * Manages WebRTC connection to LiveKit for real-time voice conversation.
 * Handles microphone streaming, transcription display, and audio playback.
 * 
 * Features:
 * - Hands-free mode: Voice Activity Detection (VAD) via Web Audio API
 *   automatically mutes/unmutes the published track when speech is detected.
 * - Multi-window awareness: BroadcastChannel notifies other open tabs when
 *   voice is active so they can show a status indicator.
 */

import { useState, useRef, useCallback, useEffect } from 'react'

// Auth: nginx injects Authorization header for all /api/ requests (see nginx.conf).
// LiveKit URL is auto-detected from window.location for WebSocket connections.
const getHost = () => typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const getProtocol = () => typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || `${getProtocol()}//${getHost()}:7880`

// Unique ID for this browser window, used for cross-window coordination.
const WINDOW_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`

// VAD tuning constants
const VAD_FFT_SIZE = 256
const VAD_SMOOTHING = 0.5
const VAD_RMS_THRESHOLD = 0.012  // 0–1 scale; tune louder for noisier environments
const VAD_SILENCE_MS = 1800       // ms of silence before auto-muting

export function useVoiceAgent() {
  // Connection state
  const [status, setStatus] = useState('disconnected') // disconnected, connecting, connected, error
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)

  // Conversation state
  const [messages, setMessages] = useState([])
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [error, setError] = useState(null)

  // Audio state
  const [volume, setVolume] = useState(1.0)
  const [isMuted, setIsMuted] = useState(false)

  // Hands-free (VAD) state
  const [handsFree, setHandsFree] = useState(false)

  // Multi-window: true when another tab has an active voice session
  const [otherWindowActive, setOtherWindowActive] = useState(false)

  // Refs for LiveKit & audio elements
  const roomRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioElementRef = useRef(null)
  const audioElementsRef = useRef([])

  // Refs for VAD (avoids stale closures in rAF loop)
  const vadRef = useRef(null) // { audioContext, animFrameId }
  const vadStreamRef = useRef(null)
  const isListeningRef = useRef(false)
  const handsFreeRef = useRef(false)

  // BroadcastChannel ref
  const channelRef = useRef(null)

  // Keep hot-path refs in sync with state
  useEffect(() => { isListeningRef.current = isListening }, [isListening])
  useEffect(() => { handsFreeRef.current = handsFree }, [handsFree])

  // ---------------------------------------------------------------------------
  // BroadcastChannel — cross-window coordination
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return

    const channel = new BroadcastChannel('dream-voice')
    channelRef.current = channel

    channel.addEventListener('message', (e) => {
      if (e.data?.type === 'VOICE_ACTIVE' && e.data.windowId !== WINDOW_ID) {
        setOtherWindowActive(e.data.active)
      }
    })

    return () => {
      channel.postMessage({ type: 'VOICE_ACTIVE', active: false, windowId: WINDOW_ID })
      channel.close()
      channelRef.current = null
    }
  }, [])

  // Broadcast whenever our connection status changes
  useEffect(() => {
    const active = status === 'connected' || status === 'connecting'
    channelRef.current?.postMessage({ type: 'VOICE_ACTIVE', active, windowId: WINDOW_ID })
  }, [status])

  // ---------------------------------------------------------------------------
  // VAD — Voice Activity Detection
  // ---------------------------------------------------------------------------

  // Stop VAD monitoring and release the analysis stream
  const stopVAD = useCallback(() => {
    if (vadRef.current) {
      if (vadRef.current.animFrameId) cancelAnimationFrame(vadRef.current.animFrameId)
      vadRef.current.audioContext.close().catch((err) => console.error('VAD cleanup error:', err))
      vadRef.current = null
    }
    if (vadStreamRef.current) {
      vadStreamRef.current.getTracks().forEach(t => t.stop())
      vadStreamRef.current = null
    }
  }, [])

  // Mute or unmute the published LiveKit audio track
  const setTrackMuted = useCallback(async (mute) => {
    if (!roomRef.current) return
    for (const pub of roomRef.current.localParticipant.getTrackPublications().values()) {
      if (pub.track?.kind === 'audio') {
        if (mute) {
          await pub.track.mute()
        } else {
          await pub.track.unmute()
        }
      }
    }
  }, [])

  // Start VAD using a separate getUserMedia stream so level monitoring
  // works even while the published LiveKit track is muted.
  const startVAD = useCallback(async () => {
    stopVAD()

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    } catch (err) {
      console.error('VAD: microphone access denied', err)
      setHandsFree(false)
      handsFreeRef.current = false
      return
    }

    vadStreamRef.current = stream

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext
    const audioContext = new AudioContextCtor()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = VAD_FFT_SIZE
    analyser.smoothingTimeConstant = VAD_SMOOTHING
    source.connect(analyser)

    const buf = new Float32Array(analyser.fftSize)
    let silenceStart = null
    let isTalking = false
    let animFrameId

    const tick = () => {
      if (!handsFreeRef.current) return // hands-free was disabled

      analyser.getFloatTimeDomainData(buf)
      // Root-mean-square of the waveform (0–1)
      const rms = Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / buf.length)

      if (rms > VAD_RMS_THRESHOLD) {
        // Speech detected
        silenceStart = null
        if (!isTalking) {
          isTalking = true
          if (!isListeningRef.current) {
            setTrackMuted(false)
            setIsListening(true)
            isListeningRef.current = true
          }
        }
      } else {
        // Silence
        if (isTalking) {
          if (silenceStart === null) {
            silenceStart = Date.now()
          } else if (Date.now() - silenceStart > VAD_SILENCE_MS) {
            isTalking = false
            silenceStart = null
            if (isListeningRef.current) {
              setTrackMuted(true)
              setIsListening(false)
              isListeningRef.current = false
            }
          }
        }
      }

      animFrameId = requestAnimationFrame(tick)
      vadRef.current.animFrameId = animFrameId
    }

    vadRef.current = { audioContext, animFrameId: null }
    tick()
  }, [stopVAD, setTrackMuted])

  // ---------------------------------------------------------------------------
  // LiveKit helpers
  // ---------------------------------------------------------------------------

  // Get LiveKit token from backend
  const getToken = useCallback(async () => {
    const response = await fetch(`/api/voice/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: `dashboard-${WINDOW_ID}` })
    })
    if (!response.ok) throw new Error('Failed to get voice token')
    const data = await response.json()
    return data.token
  }, [])

  // Connect to LiveKit room
  const connect = useCallback(async () => {
    try {
      setStatus('connecting')
      setError(null)

      const { Room, RoomEvent, Track, createLocalAudioTrack } = await import(/* @vite-ignore */ 'livekit-client')

      const token = await getToken()

      const room = new Room({ adaptiveStream: true, dynacast: true })

      room.on(RoomEvent.Connected, () => setStatus('connected'))

      room.on(RoomEvent.Disconnected, () => {
        setStatus('disconnected')
        setIsListening(false)
        isListeningRef.current = false
      })

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const audioElement = track.attach()
          audioElement.volume = volume
          document.body.appendChild(audioElement)
          audioElementRef.current = audioElement
          audioElementsRef.current.push(audioElement)
          setIsSpeaking(true)
        }
      })

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach()
          setIsSpeaking(false)
        }
      })

      room.on(RoomEvent.DataReceived, (data) => {
        try {
          const message = JSON.parse(new TextDecoder().decode(data))
          if (message.type === 'transcript') {
            if (message.final) {
              setMessages(prev => [...prev, {
                role: message.role || 'user',
                content: message.text,
                timestamp: Date.now()
              }])
              setCurrentTranscript('')
            } else {
              setCurrentTranscript(message.text)
            }
          } else if (message.type === 'assistant_speaking') {
            setIsSpeaking(true)
          } else if (message.type === 'assistant_done') {
            setIsSpeaking(false)
          }
        } catch (err) {
          console.error('Error parsing data message:', err)
        }
      })

      await room.connect(LIVEKIT_URL, token)
      roomRef.current = room

      // Publish local mic track (muted initially so VAD controls it)
      const audioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      })
      await room.localParticipant.publishTrack(audioTrack)
      mediaStreamRef.current = audioTrack.mediaStream

    } catch (err) {
      console.error('Voice connection error:', err)
      setError(err.message)
      setStatus('error')
    }
  }, [getToken, volume])

  // Disconnect from room and clean up
  const disconnect = useCallback(async () => {
    stopVAD()
    setHandsFree(false)
    handsFreeRef.current = false

    if (roomRef.current) {
      await roomRef.current.disconnect()
      roomRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    audioElementsRef.current.forEach(el => el?.parentNode?.removeChild(el))
    audioElementsRef.current = []
    audioElementRef.current = null
    setStatus('disconnected')
    setIsListening(false)
    isListeningRef.current = false
  }, [stopVAD])

  // Toggle listening (manual click mode — disabled while hands-free is on)
  const toggleListening = useCallback(async () => {
    if (handsFreeRef.current) return // VAD controls listening in hands-free mode

    if (!roomRef.current) {
      await connect()
      setIsListening(true)
      isListeningRef.current = true
      return
    }

    const newState = !isListening
    setIsListening(newState)
    isListeningRef.current = newState
    await setTrackMuted(!newState)
  }, [isListening, connect, setTrackMuted])

  // Toggle hands-free (VAD) mode
  const toggleHandsFree = useCallback(async () => {
    const enabling = !handsFree
    setHandsFree(enabling)
    handsFreeRef.current = enabling

    if (enabling) {
      // Ensure we are connected before starting VAD
      if (!roomRef.current) {
        await connect()
      }
      await startVAD()
    } else {
      stopVAD()
      // Mute if we were listening via VAD
      if (isListeningRef.current) {
        await setTrackMuted(true)
        setIsListening(false)
        isListeningRef.current = false
      }
    }
  }, [handsFree, connect, startVAD, stopVAD, setTrackMuted])

  // Mute/unmute playback (output volume)
  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev
      if (audioElementRef.current) audioElementRef.current.muted = newMuted
      return newMuted
    })
  }, [])

  // Update playback volume
  const updateVolume = useCallback((newVolume) => {
    setVolume(newVolume)
    if (audioElementRef.current) audioElementRef.current.volume = newVolume
  }, [])

  // Interrupt (stop AI speaking)
  const interrupt = useCallback(() => {
    if (roomRef.current) {
      const encoder = new TextEncoder()
      roomRef.current.localParticipant.publishData(
        encoder.encode(JSON.stringify({ type: 'interrupt' })),
        { reliable: true }
      )
    }
    setIsSpeaking(false)
  }, [])

  // Clear conversation history
  const clearMessages = useCallback(() => setMessages([]), [])

  // Cleanup on unmount
  useEffect(() => {
    return () => { disconnect() }
  }, [disconnect])

  return {
    // State
    status,
    isListening,
    isSpeaking,
    messages,
    currentTranscript,
    error,
    volume,
    isMuted,
    handsFree,
    otherWindowActive,

    // Actions
    connect,
    disconnect,
    toggleListening,
    toggleMute,
    updateVolume,
    interrupt,
    clearMessages,
    toggleHandsFree,
  }
}

export default useVoiceAgent
