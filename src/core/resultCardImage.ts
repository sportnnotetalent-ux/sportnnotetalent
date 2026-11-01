/**
 * Share a match as a picture (MVP, founder 2026-10-31): draws the score card
 * (src/core/resultCard.ts) as a 1080×1080 PNG on the web, in the app's look
 * (hero green, lime, Barlow Condensed). Null on a phone app (no drawing
 * surface there yet; the shared link's preview carries the score) or on any
 * failure, so Share falls back to the text.
 */
import { Platform } from 'react-native';
import type { CardModel } from './resultCard';

const HERO = '#0A3A2B', LIME = '#C6EE3E', WHITE = '#FFFFFF', SOFT = '#CFE3D6', TILE = '#0D5A3F';
const DISPLAY = 'BarlowCondensed_800ExtraBold_Italic';
const HEADING = 'BarlowCondensed_700Bold';

export async function cardPng(m: CardModel): Promise<Blob | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  try {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    await Promise.all([`italic 800 40px ${DISPLAY}`, `700 40px ${HEADING}`].map((f) => fonts?.load(f).catch(() => null)));
    const W = 1080;
    const c = document.createElement('canvas');
    c.width = W; c.height = W;
    const g = c.getContext('2d');
    if (!g) return null;
    const font = (size: number, display = true) => { g.font = display ? `italic 800 ${size}px ${DISPLAY}, sans-serif` : `700 ${size}px ${HEADING}, sans-serif`; };
    /** Text shrunk until it fits `max` pixels. */
    const fit = (text: string, size: number, max: number, display = true) => {
      let s = size;
      font(s, display);
      while (s > 20 && g.measureText(text).width > max) { s -= 4; font(s, display); }
    };

    g.fillStyle = HERO; g.fillRect(0, 0, W, W);
    g.fillStyle = LIME; g.beginPath(); g.arc(1000, 60, 240, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(207,227,214,0.16)'; g.lineWidth = 4;
    g.strokeRect(560, 640, 600, 520); g.beginPath(); g.arc(860, 900, 100, 0, Math.PI * 2); g.stroke();

    // brand: the S:N tile and the wordmark
    g.fillStyle = TILE; g.beginPath(); g.roundRect(64, 64, 112, 112, 26); g.fill();
    font(64); g.fillStyle = LIME; g.fillText('S:', 82, 143); g.fillStyle = WHITE; g.fillText('N', 128, 143);
    font(56); g.fillStyle = WHITE; g.fillText('Sport', 200, 140);
    const sw = g.measureText('Sport').width; g.fillStyle = LIME; g.fillText('nNote', 200 + sw, 140);

    // sport and the badge
    font(44); g.fillStyle = LIME; g.fillText(m.sport, 72, 290);
    const badgeColour = m.badge === 'LIVE' ? '#B32525' : m.badge === 'RESULT' ? TILE : '#59616C';
    font(36, false); const bw = g.measureText(m.badge).width + 48;
    g.fillStyle = badgeColour; g.beginPath(); g.roundRect(W - 72 - bw, 252, bw, 56, 28); g.fill();
    g.fillStyle = WHITE; g.fillText(m.badge, W - 72 - bw + 24, 292);

    // the two sides
    const row = (name: string, score: string, y: number) => {
      fit(name, 72, score ? 640 : 900, false); g.fillStyle = WHITE; g.fillText(name, 72, y);
      if (score) { fit(score, 170, 300); g.fillStyle = LIME; g.textAlign = 'right'; g.fillText(score, W - 72, y + 20); g.textAlign = 'left'; }
    };
    row(m.home, m.homeScore, 470);
    if (!m.homeScore) { font(48); g.fillStyle = SOFT; g.fillText('vs', 72, 560); }
    row(m.away, m.awayScore, m.homeScore ? 660 : 660);

    // what happened, where, and the address
    fit(m.line, 56, 936, false); g.fillStyle = WHITE; g.fillText(m.line, 72, 800);
    if (m.where) { fit(m.where, 38, 936, false); g.fillStyle = SOFT; g.fillText(m.where, 72, 860); }
    if (m.star) { fit(m.star, 44, 936, false); g.fillStyle = LIME; g.fillText(m.star, 72, 930); }
    font(40, false); g.fillStyle = SOFT; g.fillText(m.footer, 72, 1010);

    return await new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
  } catch {
    return null;
  }
}
