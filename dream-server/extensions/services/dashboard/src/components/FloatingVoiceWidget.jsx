/**
 * FloatingVoiceWidget
 *
 * A persistent floating mic button that lives outside the router so voice
 * remains accessible from every page.  Hidden on /voice (full UI lives there).
 *
 * Features:
 * - Shows voice status at a glance (idle / listening / speaking)
 * - Expand panel with: hands-free toggle, mute, disconnect, live transcript
 * - "Active in another window" badge via BroadcastChannel
 * - Keyboard shortcut hint
 */

import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Mic, MicOff, Volume2, VolumeX, PhoneOff, Zap, ZapOff,
  ChevronUp, ChevronDown, Radio, Loader2, AlertCircle, MonitorSpeaker
} from 'lucide-react'
import { useVoice } from '../contexts/VoiceContext'

// Mini waveform shown while AI is speaking
function MiniWaveform({ active }) {
  return (
    <div className="flex items-end gap-[2px] h-4">
      {[3, 5, 4, 6, 3].map((h, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full transition-all ${active ? 'bg-indigo-400 animate-pulse' : 'bg-theme-border'}`}
          style={{ height: active ? `${h * 2}px` : '4px', animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  )
}

export default function FloatingVoiceWidget() {
  const location = useLocation()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)

  const {
    status,
    isListening,
    isSpeaking,
    currentTranscript,
    error,
    isMuted,
    handsFree,
    otherWindowActive,
    toggleListening,
    toggleMute,
    disconnect,
    toggleHandsFree,
  } = useVoice()

  // Close the panel when navigating
  useEffect(() => { setExpanded(false) }, [location.pathname])

  // Don't render on the dedicated Voice page — it has its own full UI
  if (location.pathname === '/voice') return null

  const isConnected = status === 'connected'
  const isConnecting = status === 'connecting'
  const isActive = isConnected || isConnecting
  const hasError = status === 'error'

  // Pick button ring/pulse class based on state
  const micBtnClass = [
    'relative flex items-center justify-center w-14 h-14 rounded-full shadow-xl transition-all duration-200',
    'border-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500',
    isListening
      ? 'bg-red-500 border-red-400 scale-110 animate-pulse'
      : isConnected
        ? 'bg-indigo-600 border-indigo-400 hover:scale-105'
        : hasError
          ? 'bg-red-900/80 border-red-700'
          : 'bg-theme-card border-theme-border hover:border-indigo-500 hover:scale-105',
  ].join(' ')

  const micIcon = isConnecting
    ? <Loader2 size={24} className="text-white animate-spin" />
    : isListening
      ? <MicOff size={24} className="text-white" />
      : isConnected
        ? <Mic size={24} className="text-white" />
        : hasError
          ? <AlertCircle size={24} className="text-red-300" />
          : <Mic size={24} className="text-theme-text-muted" />

  // Clicking the button when disconnected: navigate to Voice page
  // When connected: toggle listening (unless hands-free is on)
  const handleMicClick = () => {
    if (!isActive && !hasError) {
      navigate('/voice')
      return
    }
    if (!handsFree) {
      toggleListening()
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Expanded panel */}
      {expanded && (
        <div className="mb-1 w-72 bg-theme-card border border-theme-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border">
            <div className="flex items-center gap-2">
              <Radio size={14} className={isConnected ? 'text-green-400' : 'text-theme-text-muted'} />
              <span className="text-sm font-medium text-theme-text">
                {isConnecting ? 'Connecting…' : isConnected ? 'Voice active' : hasError ? 'Connection error' : 'Voice'}
              </span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-theme-text-muted hover:text-theme-text"
              aria-label="Close voice panel"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {/* Other-window banner */}
          {otherWindowActive && (
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-400">
              <MonitorSpeaker size={13} />
              <span>Voice is active in another window</span>
            </div>
          )}

          {/* Live transcript preview */}
          {(isListening || currentTranscript) && (
            <div className="px-4 py-2 border-b border-theme-border">
              <p className="text-xs text-theme-text-muted mb-1">Transcript</p>
              <p className="text-sm text-theme-text italic truncate">
                {currentTranscript || '…'}
              </p>
            </div>
          )}

          {/* AI speaking indicator */}
          {isSpeaking && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-theme-border">
              <MiniWaveform active />
              <span className="text-xs text-theme-text-muted">AI is speaking…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-2 border-b border-theme-border">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between px-4 py-3">
            {/* Hands-free toggle */}
            <button
              onClick={toggleHandsFree}
              title={handsFree ? 'Disable hands-free' : 'Enable hands-free (auto-detect speech)'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                handsFree
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
                  : 'bg-theme-surface text-theme-text-muted border border-theme-border hover:border-indigo-500/40'
              }`}
            >
              {handsFree ? <Zap size={12} /> : <ZapOff size={12} />}
              {handsFree ? 'Hands-free' : 'Hands-free'}
            </button>

            <div className="flex items-center gap-2">
              {/* Mute output */}
              <button
                onClick={toggleMute}
                title={isMuted ? 'Unmute output' : 'Mute output'}
                className="p-2 text-theme-text-muted hover:text-theme-text transition-colors rounded-lg hover:bg-theme-surface"
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>

              {/* Disconnect */}
              {isActive && (
                <button
                  onClick={disconnect}
                  title="Disconnect voice"
                  className="p-2 text-red-400 hover:text-red-300 transition-colors rounded-lg hover:bg-red-500/10"
                >
                  <PhoneOff size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Navigate to full Voice page */}
          <div className="px-4 pb-3">
            <button
              onClick={() => navigate('/voice')}
              className="w-full text-xs text-center text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Open full voice panel →
            </button>
          </div>
        </div>
      )}

      {/* Floating action button row */}
      <div className="flex items-center gap-2">
        {/* Hands-free quick badge */}
        {handsFree && isConnected && (
          <div className="flex items-center gap-1 px-2 py-1 bg-indigo-500/20 border border-indigo-500/40 rounded-full text-[10px] text-indigo-300">
            <Zap size={10} />
            Hands-free
          </div>
        )}

        {/* Speaking waveform badge */}
        {isSpeaking && (
          <div className="px-2 py-1">
            <MiniWaveform active />
          </div>
        )}

        {/* Expand / collapse chevron */}
        {isActive && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-theme-card border border-theme-border text-theme-text-muted hover:text-theme-text transition-colors shadow"
            aria-label={expanded ? 'Collapse voice panel' : 'Expand voice panel'}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        )}

        {/* Main mic button */}
        <button
          onClick={handleMicClick}
          className={micBtnClass}
          aria-label={
            isListening ? 'Stop listening'
              : isConnected ? 'Start listening'
              : 'Open voice'
          }
          title={handsFree ? 'Hands-free: VAD controls mic' : undefined}
        >
          {micIcon}

          {/* Activity dot for other-window awareness */}
          {otherWindowActive && !isActive && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-400 rounded-full border-2 border-theme-bg" />
          )}
        </button>
      </div>
    </div>
  )
}
