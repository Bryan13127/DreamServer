/**
 * VoiceContext — lifts useVoiceAgent to app level so the voice session
 * persists across page navigation (multi-window / multi-page use).
 *
 * Wrap the app with <VoiceProvider> and consume voice state in any
 * component via useVoice().
 */

import { createContext, useContext } from 'react'
import { useVoiceAgent } from '../hooks/useVoiceAgent'

const VoiceContext = createContext(null)

export function VoiceProvider({ children }) {
  // Single shared instance — survives route changes
  const voice = useVoiceAgent()
  return <VoiceContext.Provider value={voice}>{children}</VoiceContext.Provider>
}

export function useVoice() {
  const ctx = useContext(VoiceContext)
  if (!ctx) throw new Error('useVoice must be used inside <VoiceProvider>')
  return ctx
}
