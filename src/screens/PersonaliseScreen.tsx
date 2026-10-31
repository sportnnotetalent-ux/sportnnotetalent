/**
 * The first-run questions (founder 2026-10-31): how they'll use SportnNote, their
 * sports, position and handedness per sport, the city they're based in, and
 * location for "Near you". About a minute; a one-tap Skip on every step (someone
 * at the ground in a hurry just wants to get to the match). The answers go
 * straight into their profile, so nothing is filled in twice. Opens by itself
 * once from Home (never over a link someone opened); Settings → Personalise my
 * Home opens it again, pre-filled.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { Glyph, IconText } from '../components/Icon';
import { theme } from '../core/theme';
import { Button, FieldLabel, FormError, SelectChip, TextField, textStyles } from '../components/ui';
import { SPORT_LIST, getSportMeta } from '../sports/sportMeta';
import { SPORT_POSITIONS, SPORT_SIDE_FIELDS } from '../data/sportProfileFields';
import { useAuth } from '../core/auth';
import { track } from '../core/telemetry';
import {
  MAX_POSITIONS, USES, locationAllowed, personaliseSteps, sportsQuestion, splitPositions, plays, type SportAnswer, type Use,
} from '../core/personalise';
import { askLocation, canAskLocation, declineLocation } from '../core/location';
import { getMyPersonalisation, savePersonalisation, searchCities, skipPersonalisation, type City } from '../data/personalise';
import { getMyPlayerId, getPlayer } from '../data/repos';
import type { SportId } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function PersonaliseScreen() {
  const nav = useNavigation<Nav>();
  const { profile } = useAuth();
  const [uses, setUses] = useState<Use[]>([]);
  const [sports, setSports] = useState<SportId[]>([]);
  const [answers, setAnswers] = useState<Partial<Record<SportId, SportAnswer>>>({});
  const [city, setCity] = useState<City | null>(null);
  const [i, setI] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // PH-10: adults only; until their profile has loaded, no location step.
  const [adult, setAdult] = useState(false);
  const canLocate = useMemo(canAskLocation, []) && adult;
  const steps = personaliseSteps({ uses, sports, canAskLocation: canLocate });
  const step = steps[Math.min(i, steps.length - 1)];

  // Asked again from Settings: start from what they said before and what their profile already says.
  useEffect(() => {
    let on = true;
    (async () => {
      const [mine, pid] = await Promise.all([getMyPersonalisation().catch(() => null), getMyPlayerId(profile?.id).catch(() => null)]);
      const player = pid ? await getPlayer(pid).catch(() => null) : null;
      if (!on) return;
      setAdult(locationAllowed(player));
      if (mine?.uses.length) setUses(mine.uses);
      if (mine?.homeCity) setCity(mine.homeCity);
      const known = mine?.sports.length ? mine.sports : (player?.sports ?? []);
      if (known.length) setSports(known);
      if (player?.sportDetails) {
        const pre: Partial<Record<SportId, SportAnswer>> = {};
        for (const [s, d] of Object.entries(player.sportDetails) as [SportId, { position?: string; sides?: Record<string, string> }][]) {
          pre[s] = { positions: splitPositions(d?.position).filter((p) => SPORT_POSITIONS[s]?.includes(p)), sides: { ...(d?.sides ?? {}) } };
        }
        setAnswers(pre);
      }
    })();
    return () => { on = false; };
  }, [profile?.id]);

  const close = () => {
    if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Tabs', { screen: 'Home' });
  };
  const skip = () => {
    track('onboarding_step', { step: 'personalise', action: 'skip', at: step.kind });
    skipPersonalisation().catch(() => undefined);
    close();
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      // Only the sports' cards that are still chosen.
      const kept = Object.fromEntries(Object.entries(answers).filter(([s]) => sports.includes(s as SportId))) as typeof answers;
      await savePersonalisation({ profileId: profile?.id, uses, sports, homeCity: city, answers: kept });
      track('onboarding_step', { step: 'personalise', action: 'done', sports: sports.length });
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    const after = steps[i + 1];
    if (after?.kind === 'done' && !(await save())) return;
    setI((x) => Math.min(x + 1, steps.length - 1));
  };
  const back = () => setI((x) => Math.max(0, x - 1));

  const canNext = step.kind === 'uses' ? uses.length > 0 : step.kind === 'sports' ? sports.length > 0 : true;
  const total = steps.length - 1; // the last screen isn't a question

  return (
    <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
      {step.kind !== 'done' ? (
        <View style={st.top}>
          <View style={st.bar}><View style={[st.barFill, { width: `${Math.round(((i + 1) / total) * 100)}%` }]} /></View>
          <TouchableOpacity onPress={skip} accessibilityRole="button" accessibilityLabel="Skip these questions" hitSlop={12}>
            <Text style={st.skip}>Skip</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        {step.kind === 'uses' && (
          <>
            <Title title="How will you use SportnNote?" sub="Pick any. We’ll set up your Home around it." />
            {USES.map((u) => {
              const on = uses.includes(u.id);
              return (
                <TouchableOpacity key={u.id} style={[st.row, on && st.rowOn]} activeOpacity={0.85} accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }} onPress={() => setUses((x) => (on ? x.filter((y) => y !== u.id) : [...x, u.id]))}>
                  <Glyph emoji={u.icon} style={st.rowIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={[textStyles.body, st.rowLabel, on && st.onText]}>{u.label}</Text>
                    <Text style={[textStyles.muted, on && st.onText]}>{u.hint}</Text>
                  </View>
                  <Text style={[st.tick, on && st.onText]}>{on ? '✓' : ''}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {step.kind === 'sports' && (
          <>
            <Title title={sportsQuestion(uses)} sub="Pick as many as you like. Home shows these first." />
            <View style={st.grid}>
              {SPORT_LIST.map((m) => {
                const on = sports.includes(m.id);
                return (
                  <TouchableOpacity key={m.id} style={[st.tile, on && st.rowOn]} activeOpacity={0.85} accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }} accessibilityLabel={m.name}
                    onPress={() => setSports((x) => (on ? x.filter((y) => y !== m.id) : [...x, m.id]))}>
                    <Text style={st.tileIcon}>{m.icon}</Text>
                    <Text style={[textStyles.body, { flex: 1 }, on && st.onText]} numberOfLines={1}>{m.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {step.kind === 'sport' && (
          <SportCard sport={step.sport} answer={answers[step.sport] ?? { positions: [], sides: {} }}
            onChange={(a) => setAnswers((x) => ({ ...x, [step.sport]: a }))} />
        )}

        {step.kind === 'city' && <CityStep city={city} onPick={setCity} />}

        {step.kind === 'location' && (
          <>
            <Title title="See live matches near you" sub="Allow location and Home shows the nearest live matches first." />
            <View style={st.note}>
              <IconText style={textStyles.body} label="📍 Only while you’re using the app, never in the background." />
              <IconText style={textStyles.body} label="🔒 Rounded to about 1 km and never stored." />
              <IconText style={textStyles.body} label={`🏙️ Without it, Home uses ${city ? city.name : 'your city'}.`} />
            </View>
            <Button label="Allow location" variant="brand" disabled={saving}
              onPress={async () => { await askLocation(); await next(); }} />
            <Button label="Not now" variant="ghost" disabled={saving}
              onPress={async () => { await declineLocation(); await next(); }} />
          </>
        )}

        {step.kind === 'done' && (
          <>
            <Title title="Your Home is ready" sub={summary(sports, city)} />
            <Text style={[textStyles.h3, { marginTop: theme.spacing(2) }]}>What would you like to do first?</Text>
            {uses.includes('organise') ? (
              <Button label="🏆 Run a tournament" variant="brand" onPress={() => nav.replace('QuickTournament', undefined)} />
            ) : null}
            {plays(uses) || uses.includes('score') ? (
              <Button label="🤝 Score a match now" variant={uses.includes('organise') ? 'ghost' : 'brand'} onPress={() => nav.replace('ScheduleMatch', undefined)} />
            ) : null}
            <Button label="🏠 Go to my Home" variant="ghost" onPress={close} />
          </>
        )}

        <FormError message={error} />
      </KeyboardAwareScrollView>

      {step.kind !== 'done' && step.kind !== 'location' ? (
        <View style={st.footer}>
          {i > 0 ? <Button label="Back" variant="ghost" onPress={back} style={{ flex: 1 }} /> : null}
          <View style={{ flex: 2 }}>
            {saving ? <ActivityIndicator color={theme.colors.primary} /> : (
              <Button label={step.kind === 'sport' || step.kind === 'city' ? (hasAnswer(step, answers, city) ? 'Next' : 'Skip this one') : 'Next'}
                variant="brand" disabled={!canNext} onPress={next} />
            )}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function hasAnswer(step: { kind: string; sport?: SportId }, answers: Partial<Record<SportId, SportAnswer>>, city: City | null): boolean {
  if (step.kind === 'city') return !!city;
  const a = step.sport ? answers[step.sport] : undefined;
  return !!a && (a.positions.length > 0 || Object.keys(a.sides).length > 0);
}

function summary(sports: SportId[], city: City | null): string {
  const names = sports.slice(0, 3).map((s) => getSportMeta(s).name);
  if (sports.length > 3) names.push(`${sports.length - 3} more`);
  const what = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? 'every sport';
  return `Home now shows ${what} first${city ? `, around ${city.name}` : ''}. Your answers are on your profile, and you can change them in Settings → Personalise my Home.`;
}

function Title({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={{ gap: theme.spacing(1), marginBottom: theme.spacing(1) }}>
      <Text style={textStyles.h2}>{title}</Text>
      <Text style={textStyles.muted}>{sub}</Text>
    </View>
  );
}

function SportCard({ sport, answer, onChange }: { sport: SportId; answer: SportAnswer; onChange: (a: SportAnswer) => void }) {
  const meta = getSportMeta(sport);
  const positions = SPORT_POSITIONS[sport] ?? [];
  const sides = SPORT_SIDE_FIELDS[sport] ?? [];
  const full = answer.positions.length >= MAX_POSITIONS;
  return (
    <>
      <Title title={`${meta.icon} ${meta.name}`} sub="Saved to your profile. Leave anything you’d rather not say." />
      {positions.length ? (
        <View style={st.block}>
          <FieldLabel hint={`Up to ${MAX_POSITIONS}`}>Position</FieldLabel>
          <View style={st.chips}>
            {positions.map((p) => {
              const on = answer.positions.includes(p);
              return (
                <SelectChip key={p} label={p} active={on} disabled={!on && full}
                  onPress={() => onChange({ ...answer, positions: on ? answer.positions.filter((x) => x !== p) : [...answer.positions, p] })} />
              );
            })}
          </View>
        </View>
      ) : null}
      {sides.map((f) => (
        <View key={f.key} style={st.block}>
          <FieldLabel>{f.label}</FieldLabel>
          <View style={st.chips}>
            {f.options.map((o) => {
              const on = answer.sides[f.key] === o;
              return (
                <SelectChip key={o} label={o} active={on} onPress={() => {
                  const next = { ...answer.sides };
                  if (on) delete next[f.key]; else next[f.key] = o;
                  onChange({ ...answer, sides: next });
                }} />
              );
            })}
          </View>
        </View>
      ))}
    </>
  );
}

function CityStep({ city, onPick }: { city: City | null; onPick: (c: City | null) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<City[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => {
      searchCities(q).then((r) => { if (n === seq.current) { setFound(r); setError(null); } })
        .catch((e) => { if (n === seq.current) setError((e as Error).message); });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <>
      <Title title="Where are you based?" sub="Your city or town. Home shows matches around it, most watched first." />
      {city ? (
        <TouchableOpacity style={[st.row, st.rowOn]} onPress={() => onPick(null)} accessibilityRole="button" accessibilityLabel={`${city.name}, chosen. Tap to change`}>
          <Glyph emoji="📍" style={st.rowIcon} />
          <View style={{ flex: 1 }}>
            <Text style={[textStyles.body, st.rowLabel, st.onText]}>{city.name}</Text>
            <Text style={[textStyles.muted, st.onText]}>{place(city)}</Text>
          </View>
          <Text style={[st.tick, st.onText]}>Change</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TextField label="City or town" value={q} onChange={setQ} placeholder="e.g. Hyderabad" autoCapitalize="words" />
          {found.map((c) => (
            <TouchableOpacity key={c.id} style={st.row} onPress={() => { onPick(c); setQ(''); }} accessibilityRole="button" accessibilityLabel={`${c.name}, ${place(c)}`}>
              <Glyph emoji="📍" style={st.rowIcon} />
              <View style={{ flex: 1 }}>
                <Text style={[textStyles.body, st.rowLabel]}>{c.name}</Text>
                <Text style={textStyles.muted}>{place(c)}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {q.trim().length >= 2 && !found.length && !error ? <Text style={textStyles.muted}>No town by that name yet. Try the nearest city.</Text> : null}
          <FormError message={error} />
        </>
      )}
    </>
  );
}

const COUNTRY: Record<string, string> = { IN: 'India', AE: 'UAE', QA: 'Qatar', GB: 'UK', SG: 'Singapore', MY: 'Malaysia', AU: 'Australia', US: 'USA' };
const place = (c: City) => [c.region, COUNTRY[c.country] ?? c.country].filter(Boolean).join(', ');

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingHorizontal: theme.spacing(4), paddingTop: theme.spacing(2) },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: theme.colors.primary },
  skip: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '700' },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(3),
  },
  rowOn: { borderColor: theme.colors.lime, backgroundColor: theme.colors.lime },
  rowIcon: { fontSize: 22 },
  rowLabel: { fontWeight: '700' },
  onText: { color: theme.colors.onLime },
  tick: { color: theme.colors.textMuted, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  tile: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3), width: '48%',
  },
  tileIcon: { fontSize: 22 },
  block: { gap: theme.spacing(2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  note: { gap: theme.spacing(2), backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing(3), borderWidth: 1, borderColor: theme.colors.border },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingHorizontal: theme.spacing(4),
    paddingVertical: theme.spacing(3), borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.bg,
  },
});
