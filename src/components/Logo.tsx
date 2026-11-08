/** The SportnNote logo, option 2d (founder 2026-11-08,
 *  docs/security/breaks/brand-cream.md): the "S:N" scoreline on a cream tile —
 *  a lime "S" and a white "N", each with a thin dark green outline, leaning
 *  forward like the italic headlines, and a plain near-black colon. Same
 *  drawing as every app/web icon — see scripts/build-icons.mjs. */
import React from 'react';
import Svg, { Rect, Path, Circle, G } from 'react-native-svg';

const TILE = '#F3F0E8';
const LIME = '#C6EE3E';
const WHITE = '#FFFFFF';
const KEY = '#0A3A2B';
const INK = '#14181D';
/** The lean, in degrees (negative = forward). */
const SKEW = -8;
const SW = 16;
const KEY_W = 23;
const lean = Math.tan((SKEW * Math.PI) / 180);
const dotX = (cy: number) => 100 + lean * (cy - 100);
const S_PATH = 'M80 68 H52 a16 16 0 0 0 0 32 h12 a16 16 0 0 1 0 32 H34';
const N_PATH = 'M122 132 V68 L166 132 V68';

export function Logo({ size = 32 }: { size?: number }) {
  const line = (d: string, color: string, w: number) => (
    <Path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" accessibilityLabel="SportnNote">
      <Rect width={200} height={200} rx={44} fill={TILE} />
      <G transform="translate(100 100) scale(0.94) translate(-100 -100)">
        <G transform={`translate(100 100) skewX(${SKEW}) translate(-100 -100)`}>
          {line(S_PATH, KEY, KEY_W)}
          {line(N_PATH, KEY, KEY_W)}
          {line(S_PATH, LIME, SW)}
          {line(N_PATH, WHITE, SW)}
        </G>
        <Circle cx={dotX(86)} cy={86} r={SW / 2 + 0.5} fill={INK} />
        <Circle cx={dotX(114)} cy={114} r={SW / 2 + 0.5} fill={INK} />
      </G>
    </Svg>
  );
}
