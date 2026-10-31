/** Reusable per-sport rule/format editor. Renders a sport's `formatFields`
 *  (choice / count / toggle / number) so both tournament creation and one-off
 *  match scheduling can set the same optional rules. */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SportBadge } from './SportSymbol';
import { theme } from '../core/theme';
import { SelectChip, TextField, textStyles } from './ui';
import { getSportMeta } from '../sports/sportMeta';
import { clampNumber, fieldChanges, isHidden } from '../sports/formatPick';
import type { FormatField, FormatFieldOption } from '../sports/types';
import type { SportId } from '../core/types';

export type FormatVal = number | string | boolean;

/** Default values for a field set, e.g. to seed a fresh format map. Applies the
 *  DEFAULT preset's `set{}` on top of the per-field defaults, so a fresh format
 *  actually matches the preset shown as selected (otherwise a sport whose preset
 *  default names non-default siblings — e.g. padel "Premier" ⇒ golden point —
 *  would silently seed the wrong rules). */
export const defaultsFor = (fields: FormatField[], ctx?: 'tournament'): Record<string, FormatVal> => {
  const preset = fields.find((f) => f.type === 'preset');
  // A preset may name a different default for tournaments (SD-06: pickleball).
  const presetDefault = ctx === 'tournament' && preset?.tournamentDefault != null ? preset.tournamentDefault : preset?.default;
  const out: Record<string, FormatVal> = Object.fromEntries(fields.map((f) => [f.key, f === preset ? presetDefault! : f.default]));
  const chosen = preset?.options?.find((o) => o.value === presetDefault);
  if (chosen?.set) Object.assign(out, chosen.set);
  return out;
};

export function FormatFieldEditor({ field, value, onChange, disabled }: { field: FormatField; value: FormatVal; onChange: (v: FormatVal) => void; disabled?: boolean }) {
  if (field.type === 'choice' || field.type === 'preset') {
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={textStyles.muted}>{field.label}{field.hint ? ` · ${field.hint}` : ''}</Text>
        <View style={fe.chips}>
          {(field.options ?? []).map((o) => (
            <SelectChip key={String(o.value)} label={o.label} active={value === o.value} disabled={disabled} onPress={() => onChange(o.value)} />
          ))}
        </View>
      </View>
    );
  }
  if (field.type === 'count') {
    const min = field.min ?? 1;
    const max = field.max ?? 11;
    const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={textStyles.muted}>{field.label}{field.hint ? ` · ${field.hint}` : ''}</Text>
        <View style={fe.chips}>
          {nums.map((n) => (
            <SelectChip key={n} label={String(n)} active={value === n} disabled={disabled} onPress={() => onChange(n)} />
          ))}
        </View>
      </View>
    );
  }
  if (field.type === 'toggle') {
    return (
      <View style={{ gap: theme.spacing(2) }}>
        <Text style={textStyles.muted}>{field.label}{field.hint ? ` · ${field.hint}` : ''}</Text>
        <View style={fe.chips}>
          <SelectChip label="On" active={value === true} disabled={disabled} onPress={() => onChange(true)} />
          <SelectChip label="Off" active={value !== true} disabled={disabled} onPress={() => onChange(false)} />
        </View>
      </View>
    );
  }
  return (
    <TextField
      label={`${field.label}${field.hint ? ` (${field.hint})` : ''}`}
      value={String(value)}
      onChange={(t) => onChange(Number(t.replace(/[^0-9]/g, '')) || 0)}
      // MVP B7: blank → the default, else kept within min–max, when the box is left
      onBlur={() => onChange(clampNumber(field, Number(value)))}
      autoCapitalize="none"
    />
  );
}

/** The full rule card for one sport — every formatField, with current values.
 *  If the sport has a `preset` field, it leads; the granular (advanced) fields are
 *  hidden until the preset is "Custom" or the organizer taps "Customize". */
export function SportFormatEditor({
  sport, value, onChange, heading, omitKeys, onlyKeys,
}: {
  sport: SportId;
  value: Record<string, FormatVal>;
  onChange: (key: string, v: FormatVal) => void;
  /** word after the sport name — "rules" (default) or "format". */
  heading?: string;
  /** field keys to hide — used when a field (e.g. Singles/Doubles) is already
   *  surfaced elsewhere in the flow, so it isn't shown twice. */
  omitKeys?: string[];
  /** render ONLY these keys (the tournament form's inline "basics") — no
   *  advanced reveal and no "Customize" link; the full editor lives elsewhere. */
  onlyKeys?: string[];
}) {
  const plugin = getSportMeta(sport);
  const fields = (plugin.formatFields ?? []).filter((f) => !omitKeys?.includes(f.key) && (!onlyKeys || onlyKeys.includes(f.key)));
  const [showAll, setShowAll] = useState(false);
  if (!fields.length) return null;

  const presetField = fields.find((f) => f.type === 'preset');
  const rest = fields.filter((f) => f !== presetField);
  const presetVal = presetField ? (value[presetField.key] ?? presetField.default) : 'custom';
  const isCustom = presetVal === 'custom';
  const hasAdvanced = rest.some((f) => f.advanced);
  const revealAdvanced = !!onlyKeys || !presetField || isCustom || showAll;

  // Picking a preset snaps every sibling it names; each onChange composes on the
  // parent's functional setState, so the batch lands together.
  const pickPreset = (o: FormatFieldOption) => {
    for (const [k, v] of fieldChanges(presetField!, o.value)) onChange(k, v);
    if (o.value !== 'custom') setShowAll(false);
  };

  return (
    <View style={fe.card}>
      <View style={fe.head}>
        <SportBadge sport={plugin.id} size={24} />
        <Text style={[textStyles.h3, { flexShrink: 1 }]}>{plugin.name} {heading ?? 'rules'}</Text>
      </View>

      {presetField && (
        <View style={{ gap: theme.spacing(2) }}>
          <Text style={textStyles.muted}>{presetField.label}{presetField.hint ? ` · ${presetField.hint}` : ''}</Text>
          <View style={fe.chips}>
            {(presetField.options ?? []).map((o) => (
              <SelectChip key={String(o.value)} label={o.label} active={presetVal === o.value} onPress={() => pickPreset(o)} />
            ))}
          </View>
        </View>
      )}

      {rest.map((field, i) =>
        (field.advanced && !revealAdvanced) || isHidden(field, value) ? null : (
          <React.Fragment key={field.key}>
            {/* deep wave: a heading over toggles that share a group (event sports' "Stats to track") */}
            {field.group && field.group !== rest[i - 1]?.group ? <Text style={fe.group}>{field.group}</Text> : null}
            <FormatFieldEditor
              field={field}
              value={value[field.key] ?? field.default}
              onChange={(v) => { for (const [k, fv] of fieldChanges(field, v)) onChange(k, fv); }}
            />
          </React.Fragment>
        )
      )}

      {!onlyKeys && presetField && !isCustom && hasAdvanced && (
        <Text style={fe.customize} onPress={() => setShowAll((s) => !s)}>
          {showAll ? '▴ Hide detailed options' : '⚙ Customize this format'}
        </Text>
      )}
    </View>
  );
}

const fe = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  card: {
    gap: theme.spacing(3), backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  customize: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '800' },
  group: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: theme.spacing(1) },
});
