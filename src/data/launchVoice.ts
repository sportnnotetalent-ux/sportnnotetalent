/**
 * Plays the launch voice (reference-video A2). `expo-audio` is a native
 * module: app builds before 1.1.0 (APK 41) don't have it, yet they receive
 * this code over the air. So it's only loaded after checking the native module
 * exists. Importing it on an old build would crash the app.
 *
 * The clip: assets/sounds/launch-voice.m4a is a machine-voice PLACEHOLDER.
 * Replace it with the founder's recording, then set VOICE_CLIP_READY = true.
 * Both ship over the air.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export const VOICE_CLIP_READY = false;

export function audioModuleReady(): boolean {
  if (Platform.OS === 'web') return false;
  try { return !!requireOptionalNativeModule('ExpoAudio'); } catch { return false; }
}

export async function playLaunchVoice(): Promise<void> {
  if (!audioModuleReady()) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require('expo-audio') as typeof import('expo-audio');
    // silent switch on → no sound; other apps' music is lowered, not stopped
    await audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'duckOthers', shouldPlayInBackground: false });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const player = audio.createAudioPlayer(require('../../assets/sounds/launch-voice.m4a'));
    player.play();
    setTimeout(() => { try { player.remove(); } catch { /* already gone */ } }, 3000);
  } catch {
    /* never let the welcome sound break the app */
  }
}
