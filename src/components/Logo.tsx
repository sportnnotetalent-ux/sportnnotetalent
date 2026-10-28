/** The SportnNote logo: the "S:N" scoreline — a lime "S:" and a white "N"
 *  leaning forward like the italic headlines, on the pitch green. Same drawing
 *  as every app/web icon — see scripts/build-icons.mjs. */
import React from 'react';
import Svg, { Rect, Path, Circle, G } from 'react-native-svg';

const TILE = '#0D5A3F';
const LIME = '#C6EE3E';
const WHITE = '#FFFFFF';
/** The lean, in degrees (negative = forward). */
const SKEW = -8;
const SW = 16;
const lean = Math.tan((SKEW * Math.PI) / 180);
const dotX = (cy: number) => 100 + lean * (cy - 100);

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" accessibilityLabel="SportnNote">
      <Rect width={200} height={200} rx={44} fill={TILE} />
      <G transform="translate(100 100) scale(0.94) translate(-100 -100)">
        <G transform={`translate(100 100) skewX(${SKEW}) translate(-100 -100)`}>
          <Path d="M80 68 H52 a16 16 0 0 0 0 32 h12 a16 16 0 0 1 0 32 H34" fill="none" stroke={LIME} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M122 132 V68 L166 132 V68" fill="none" stroke={WHITE} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" />
        </G>
        <Circle cx={dotX(86)} cy={86} r={SW / 2 + 0.5} fill={LIME} />
        <Circle cx={dotX(114)} cy={114} r={SW / 2 + 0.5} fill={LIME} />
      </G>
    </Svg>
  );
}
