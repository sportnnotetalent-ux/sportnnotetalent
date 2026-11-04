/** The one city field (UI audit step 4, docs/security/breaks/one-of-each.md):
 *  type, pick from the app's city list (search_cities) — the same list as
 *  "Where are you based?". A town not on the list can still be typed. */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TextField, textStyles } from './ui';
import { theme } from '../core/theme';
import { searchCities, type City } from '../data/personalise';
import { cityLabel } from '../core/cityPick';

export function CityField({ label = 'City', value, onChange, placeholder = 'Start typing a city' }: {
  label?: string; value: string; onChange: (city: string) => void; placeholder?: string;
}) {
  const [found, setFound] = useState<City[]>([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const n = ++seq.current;
    const t = setTimeout(() => {
      searchCities(value).then((r) => { if (n === seq.current) setFound(r); }).catch(() => { if (n === seq.current) setFound([]); });
    }, 250);
    return () => clearTimeout(t);
  }, [value, open]);
  const shown = open ? found.filter((c) => c.name.toLowerCase() !== value.trim().toLowerCase()) : [];
  return (
    <View style={{ gap: theme.spacing(1) }}>
      <TextField label={label} value={value} onChange={(v) => { setOpen(true); onChange(v); }} placeholder={placeholder} autoCapitalize="words" />
      {shown.map((c) => (
        <TouchableOpacity key={c.id} style={st.row} accessibilityRole="button" accessibilityLabel={`Use ${cityLabel(c)}`}
          onPress={() => { onChange(c.name); setOpen(false); setFound([]); }}>
          <Text style={textStyles.body}>📍 {c.name}</Text>
          <Text style={textStyles.muted}>{cityLabel(c).slice(c.name.length + 2)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3),
    borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceAlt },
});
