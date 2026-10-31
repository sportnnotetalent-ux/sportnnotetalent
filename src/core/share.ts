/**
 * Open the system share sheet (WhatsApp, Messages, email, …) with a message —
 * always the first choice. On the web the sheet exists in mobile Safari/Chrome
 * (navigator.share). Where it doesn't (desktop browsers):
 *   • where WhatsApp is the everyday chat app (India, Gulf, UK, SG/MY — see
 *     core/chatRegion.ts) we open WhatsApp with the text pre-filled, as before;
 *   • elsewhere (US, Australia, …) we copy the message so it can be pasted into
 *     any chat or email.
 */
import { Linking, Platform, Share } from 'react-native';
import { track } from './telemetry';
import { whatsappFirst } from './chatRegion';
import { notice } from './confirm';

/** Desktop-web fallback when there is no share sheet. Exported for reuse. */
export async function shareFallbackWeb(message: string): Promise<'whatsapp' | 'copied' | 'failed'> {
  if (whatsappFirst()) {
    await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
    return 'whatsapp';
  }
  try {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clip) {
      await clip.writeText(message);
      notice('Copied', 'Paste it into any chat, text or email.');
      return 'copied';
    }
  } catch { /* clipboard blocked */ }
  notice('Copy this message', message);
  return 'failed';
}

/** Share with a picture where the device can (MVP 2026-10-31: the score card
 *  on the web — WhatsApp status, Instagram); everywhere else, and if anything
 *  fails, exactly the text share. `card` draws the picture only when needed. */
export async function shareMessageWithCard(message: string, what: 'match' | 'tournament' | 'golf' | 'profile' | 'results' | 'invite', card: () => Promise<Blob | null>): Promise<void> {
  const nav = Platform.OS === 'web' && typeof navigator !== 'undefined'
    ? (navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean })
    : null;
  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && typeof File !== 'undefined') {
    const blob = await card().catch(() => null);
    const file = blob ? new File([blob], 'sportnnote-score.png', { type: 'image/png' }) : null;
    if (file && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], text: message });
        track('share_link', { what, image: true });
        return;
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
      }
    }
  }
  return shareMessage(message, what);
}

export async function shareMessage(message: string, what: 'match' | 'tournament' | 'golf' | 'profile' | 'results' | 'invite'): Promise<void> {
  const web = Platform.OS === 'web' && typeof navigator !== 'undefined';
  try {
    if (web && typeof (navigator as { share?: unknown }).share !== 'function') {
      await shareFallbackWeb(message);
    } else {
      await Share.share({ message });
    }
    track('share_link', { what });
  } catch (e) {
    // The user closing the sheet isn't a failure. Anything else on the web
    // (e.g. share blocked) → the desktop fallback.
    if ((e as { name?: string })?.name === 'AbortError') return;
    if (web) void shareFallbackWeb(message);
  }
}
