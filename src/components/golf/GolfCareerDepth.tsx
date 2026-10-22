/** Deep wave — the golf career's broadcast figures on the player profile:
 *  scoring by par (3 / 4 / 5) and by nine, birdie-or-better and bogey-or-worse
 *  rates, bounce back, holes in one; driving distance on measured holes;
 *  putting splits (one- / three-putt %, birdie conversion, first putts holed by
 *  length); round 2 — up and downs (around the green), drives also in metres. From the golf stat schema's deep-wave sections — a row shows only
 *  once a round carries it, with "over N of M rounds" when only some did
 *  (older rounds read "not tracked", never 0). */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { careerSections } from '../../data/career';
import { statSchema } from '../../sports/statSchemas';
import type { StatLine } from '../../core/types';
import { YARD_M } from '../../sports/golf/engine';

const DEEP_SECTIONS = ['byPar', 'driving', 'around', 'putting'];
/** Round 2 — drives are kept in yards; the career adds the metric figure. */
const DRIVE_ROWS = ['drivingDistance', 'longDrive'];
const withMetres = (key: string, value: string): string => {
  const n = Number(value);
  return DRIVE_ROWS.includes(key) && Number.isFinite(n) && n > 0 ? `${value} (${(n * YARD_M).toFixed(key === 'longDrive' ? 0 : 1)} m)` : value;
};

export function GolfCareerDepth({ lines }: { lines: StatLine[] }) {
  const schema = statSchema('golf');
  if (!schema || !lines.length) return null;
  const secs = careerSections(schema, lines).filter((s) => DEEP_SECTIONS.includes(s.id) && s.rows.length);
  if (!secs.length) return null;
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {secs.map((s) => (
        <View key={s.id} style={st.card}>
          <Text style={st.title}>{s.title}</Text>
          {s.rows.map((r) => (
            <View key={r.key} style={st.row}>
              <Text style={st.label}>{r.label}{r.coverage ? <Text style={st.cov}>{`  over ${r.coverage.tracked} of ${r.coverage.total} rounds`}</Text> : null}</Text>
              <Text style={st.value}>{withMetres(r.key, r.value)}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3), gap: theme.spacing(1) },
  title: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: 2 },
  label: { flex: 1, color: theme.colors.text, fontSize: theme.font.small },
  cov: { color: theme.colors.textMuted, fontSize: theme.font.tiny },
  value: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '800' },
});
