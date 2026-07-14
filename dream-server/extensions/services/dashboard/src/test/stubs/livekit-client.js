// Test stub for livekit-client — the real SDK is loaded at runtime via
// dynamic import() and is not a dev dependency.
export const Room = class {}
export const RoomEvent = {}
export const Track = { Kind: { Audio: 'audio' } }
export const createLocalAudioTrack = async () => ({
  mediaStream: { getTracks: () => [] },
  detach: () => {},
})
