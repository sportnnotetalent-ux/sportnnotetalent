/**
 * Timed races round 2 — "Stats to track" for ONE event (the founder: offer the
 * meet-wide choices and per-event overrides). The meet's choices live in the
 * sport's settings (⚙ Points & timing); here an organiser switches a capture
 * on or off for this event only — lap times for the 1500 m, take-overs for
 * the relays — or picks where its lap times are read. Picking the meet's
 * value again drops the override (the event follows the meet).
 *
 * Capture choices never change a result: they only add or hide optional
 * boxes on the entry screen. Used on the event's results screen (any time)
 * and on the track / swimming event setup.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Card, SelectChip, textStyles } from '../ui';
import {
  trackOptions, trackDefaults, trackEffective, setTrackOverride, lapPointsLabel, LAP_POINT_CHOICES,
  type DisciplineDef, type PhaseFormat, type TrackOverrides, type LapPoints,
} from '../../data/results';

export function EventTrackCard({ def, f, meet, onChange, collapsible = true, busy }: {
  def: DisciplineDef;
  /** the event's phase format (or, at setup, what the new event will carry) */
  f: Partial<Pick<PhaseFormat, 'reaction' | 'splits' | 'track' | 'road'>>;
  /** tournament.formats[sport] — the meet's "Stats to track" */
  meet?: Record<string, unknown> | null;
  onChange: (track: TrackOverrides | undefined) => void;
  /** folded behind one chip (the results screen); open at setup */
  collapsible?: boolean;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  const opts = trackOptions(def, f);
  if (!opts.length) return null;
  const base = trackDefaults(def.sport, meet, f);
  const now = trackEffective(def.sport, meet, f);
  const own = f.track ?? {};
  const n = Object.keys(own).length;
  if (!open) {
    return <SelectChip label={`⚙ Stats to track — this event${n ? ` (${n} changed)` : ''}`} active={false} onPress={() => setOpen(true)} />;
  }
  const set = (key: (typeof opts)[number]['key'], v: boolean | LapPoints) => onChange(setTrackOverride(own, key, v, base));
  const lapsOn = now.lapSplits;
  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>⚙ Stats to track — this event</Text>
      <Text style={textStyles.muted}>Optional boxes on the entry screen for this event only. The meet’s choices are in the sport’s settings; pick the meet’s value to follow it again.</Text>
      {opts.map((o) => {
        if (o.key === 'lapPoints') {
          if (!lapsOn) return null;
          return (
            <View key={o.key} style={{ gap: theme.spacing(1) }}>
              <Text style={textStyles.muted}>{o.label} · {o.hint}{own.lapPoints ? ` (meet: ${lapPointsLabel(base.lapPoints).toLowerCase()})` : ''}</Text>
              <View style={st.chips}>
                {LAP_POINT_CHOICES.map((p) => <SelectChip key={p} label={lapPointsLabel(p)} active={now.lapPoints === p} disabled={busy} onPress={() => set('lapPoints', p)} />)}
              </View>
            </View>
          );
        }
        const v = now[o.key];
        const changed = typeof own[o.key] === 'boolean';
        return (
          <View key={o.key} style={{ gap: theme.spacing(1) }}>
            <Text style={textStyles.muted}>{o.label} · {o.hint}{changed ? ` (meet: ${base[o.key] ? 'on' : 'off'})` : ''}</Text>
            <View style={st.chips}>
              <SelectChip label="On" active={v} disabled={busy} onPress={() => set(o.key, true)} />
              <SelectChip label="Off" active={!v} disabled={busy} onPress={() => set(o.key, false)} />
            </View>
          </View>
        );
      })}
      {n > 0 ? <SelectChip label="Use the meet’s choices" active={false} disabled={busy} onPress={() => onChange(undefined)} /> : null}
      {collapsible ? <Text style={st.link} accessibilityRole="button" onPress={() => setOpen(false)}>▴ Hide</Text> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
});
