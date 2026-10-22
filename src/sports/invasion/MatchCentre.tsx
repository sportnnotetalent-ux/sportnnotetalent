/**
 * Deep wave (invasion-goal family) — the broadcast-style MATCH CENTRE: one
 * period selector (Overall / 1st half / Q2 …) drives both the team-vs-team
 * comparison, shown in categories (Top stats · Attack · Goalkeeping ·
 * Discipline …, ./centre.ts), and each side's player box score underneath
 * (the shared SD-23 table). Rows the match didn't track are listed as "not
 * tracked", never as zeros (D8).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import { MatchBoxScore, TeamComparison } from '../../components/BoxScore';
import type { SportId } from '../../core/types';
import { statSchema } from '../statSchemas';
import type { BoxScope, MatchBoxSource } from '../boxScore';
import { centreComparison, visibleCategories, type CentreCategory } from './centre';

export function MatchCentre({
  sport, source, categories, homeName, awayName, homeColor = theme.colors.home, awayColor = theme.colors.away, onPlayer,
}: {
  sport: SportId;
  source: MatchBoxSource;
  categories: CentreCategory[];
  homeName: string;
  awayName: string;
  homeColor?: string;
  awayColor?: string;
  onPlayer?: (playerId: string) => void;
}) {
  const schema = statSchema(sport);
  const [scope, setScope] = useState<BoxScope>('all');
  const [catId, setCatId] = useState(categories[0]?.id);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!source.tickMs) return;
    const id = setInterval(() => tick((n) => n + 1), source.tickMs);
    return () => clearInterval(id);
  }, [source.tickMs]);
  if (!schema) return null;
  // a stale period (the list shrank after an undo) falls back to Overall
  const active: BoxScope = scope !== 'all' && !source.periods.some((p) => p.value === scope) ? 'all' : scope;
  const data = source.data(active);
  const cats = visibleCategories(schema, data, active, categories);
  const cat = cats.find((c) => c.id === catId) ?? cats[0];
  const cmp = cat ? centreComparison(schema, data, active, cat) : null;
  // the player tables follow the same period (one selector for the page)
  const boxSource: MatchBoxSource = { ...source, periods: [], tickMs: undefined, data: () => data };
  return (
    <View style={{ gap: theme.spacing(3) }}>
      {source.periods.length >= 2 && (
        <View style={st.chips} accessibilityLabel="Period">
          <SelectChip label="Overall" active={active === 'all'} onPress={() => setScope('all')} />
          {source.periods.map((p) => (
            <SelectChip key={p.value} label={p.label} active={active === p.value} onPress={() => setScope(p.value)} />
          ))}
        </View>
      )}
      {cats.length > 1 && (
        <View style={st.chips} accessibilityLabel="Stat category">
          {cats.map((c) => <SelectChip key={c.id} label={c.label} active={cat?.id === c.id} onPress={() => setCatId(c.id)} />)}
        </View>
      )}
      {cmp && (cmp.rows.length > 0 || cmp.untracked.length > 0) ? (
        <TeamComparison rows={cmp.rows} homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor}
          untracked={cmp.untracked} untrackedHint={source.untrackedHint ?? 'switch it on in Scoring settings (Info tab).'} />
      ) : (
        <Text style={st.empty}>No team stats yet.</Text>
      )}
      <Text style={st.h}>Player stats</Text>
      <MatchBoxScore sport={sport} source={boxSource} show="box" homeName={homeName} awayName={awayName} homeColor={homeColor} awayColor={awayColor} onPlayer={onPlayer} />
    </View>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  empty: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  h: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
});
