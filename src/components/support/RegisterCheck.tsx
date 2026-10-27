/** Register lookup (2026-10-27): on a school's review card, its CBSE record —
 *  read for support by number (register-lookup) — beside what the school
 *  entered: the registered name (matches / close / differs), place, principal
 *  (against the Head who confirmed) and whether the affiliation is current. */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { theme } from '../../core/theme';
import { textStyles } from '../ui';
import { spelledDate } from '../../core/region';
import { affiliationCurrent, compareHeads, compareNames, type NameMatch, type RegisterResult } from '../../core/registerLookup';
import { lookupRegister } from '../../data/registerLookup';

const pad = (n: number) => String(n).padStart(2, '0');
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const MATCH: Record<NameMatch, { text: string; tone: 'ok' | 'check' | 'warn' }> = {
  match: { text: '✓ Same name', tone: 'ok' },
  close: { text: '≈ Close — check it', tone: 'check' },
  differs: { text: '⚠ Different name', tone: 'warn' },
};

export function RegisterCheck({ value, orgName, head }: { value: string; orgName: string; head?: string | null }) {
  const [res, setRes] = useState<RegisterResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    setRes(null); setErr(null);
    lookupRegister('cbse', value, orgName).then((r) => on && setRes(r)).catch((e) => on && setErr(e instanceof Error ? e.message : 'The register check didn’t work.'));
    return () => { on = false; };
  }, [value, orgName]);

  if (err) return <Text style={st.warn}>{err}</Text>;
  if (!res) return <Text style={textStyles.muted}>Checking the CBSE register…</Text>;
  if (!res.found || !res.record) return <Text style={st.warn}>⚠ The CBSE register has no school with affiliation number {value} — check the letter, or send it back.</Text>;
  const r = res.record;
  const name = MATCH[compareNames(orgName, r.name)];
  const headMatch = compareHeads(head ?? undefined, r.head);
  const current = affiliationCurrent(r, todayKey());
  return (
    <View style={st.box} accessibilityLabel="From the CBSE register">
      <Text style={st.title}>From the {res.source} register</Text>
      <View style={st.line}>
        <Text style={[textStyles.body, st.flex]}>{r.name}</Text>
        <Text style={[st.tag, st[name.tone]]}>{name.text}</Text>
      </View>
      {[r.district, r.state].some(Boolean) ? <Text style={textStyles.muted}>{[r.district, r.state].filter(Boolean).join(', ')}{r.status ? ` · ${r.status}` : ''}</Text> : null}
      {r.head ? (
        <View style={st.line}>
          <Text style={[textStyles.muted, st.flex]}>Principal: {r.head}</Text>
          {headMatch ? <Text style={[st.tag, st[MATCH[headMatch].tone]]}>{headMatch === 'match' ? '✓ Same as the Head' : headMatch === 'close' ? '≈ Like the Head' : '⚠ Not the Head named'}</Text> : null}
        </View>
      ) : null}
      {r.to ? (
        <Text style={current === false ? st.warn : textStyles.muted}>
          {current === false ? '⚠ Affiliation ended ' : 'Affiliated until '}{spelledDate(r.to)}{r.from ? ` (from ${spelledDate(r.from)})` : ''}
        </Text>
      ) : null}
      <Text style={st.link} accessibilityRole="link" onPress={() => void Linking.openURL(res.url)}>Open the record ↗</Text>
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: 4, padding: theme.spacing(2), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  title: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800' },
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 120 },
  tag: { fontSize: theme.font.small, fontWeight: '800' },
  ok: { color: theme.colors.primary },
  check: { color: theme.colors.accent },
  warn: { color: theme.colors.danger, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
});
