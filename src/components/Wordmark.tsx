/** The SportnNote wordmark, option 2d (founder 2026-11-08,
 *  docs/security/breaks/brand-cream.md): lime "Sport" and white "Note", each
 *  with a thin dark green outline, and a green "n" outlined the same way (2f), for a cream
 *  background. Drawn from vector shapes made from the brand font
 *  (src/brand/wordmark.ts), so it looks the same on every platform. The
 *  outlines are a layer underneath and the letters sit on top, so the n is
 *  never covered (BC2). */
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { WORDMARK } from '../brand/wordmark';

const LIME = '#C6EE3E';
const WHITE = '#FFFFFF';
/** the n (and the colon) — option 2f, outlined like every other letter (BC8) */
const MID = '#1F7A50';
const KEY = '#0A3A2B';

/** `height` in points; the width follows the word. */
export function Wordmark({ height = 28 }: { height?: number }) {
  const width = (WORDMARK.width / WORDMARK.height) * height;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${WORDMARK.width} ${WORDMARK.height}`} accessibilityLabel="SportnNote" accessibilityRole="image">
      <Path d={WORDMARK.parts.sport} fill={KEY} stroke={KEY} strokeWidth={WORDMARK.stroke} strokeLinejoin="round" />
      <Path d={WORDMARK.parts.n} fill={KEY} stroke={KEY} strokeWidth={WORDMARK.stroke} strokeLinejoin="round" />
      <Path d={WORDMARK.parts.note} fill={KEY} stroke={KEY} strokeWidth={WORDMARK.stroke} strokeLinejoin="round" />
      <Path d={WORDMARK.parts.sport} fill={LIME} />
      <Path d={WORDMARK.parts.n} fill={MID} />
      <Path d={WORDMARK.parts.note} fill={WHITE} />
    </Svg>
  );
}

/** the wordmark's width for a given height */
export const wordmarkWidth = (height: number) => (WORDMARK.width / WORDMARK.height) * height;
