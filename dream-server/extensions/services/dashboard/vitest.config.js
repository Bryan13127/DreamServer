import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // livekit-client is loaded at runtime only (dynamic import) and is not a
      // dev dependency. Alias it to a minimal stub so vitest doesn't error when
      // transforming the dynamic import in useVoiceAgent.js.
      'livekit-client': resolve('./src/test/stubs/livekit-client.js'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
  },
})
