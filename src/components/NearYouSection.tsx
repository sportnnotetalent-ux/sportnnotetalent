/**
 * Home's "Near you" (founder 2026-10-31): live matches in the person's sports,
 * nearest first when they've allowed location, else the most viewed in their
 * city; when nothing's live, matches starting soon and just finished. Their
 * sports first, then every sport (said so). Plus the small "Finish setting up"
 * card for anyone who skipped the first-run questions.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { theme } from '../core/theme';
import { Button, Card, EmptyState, LoadingState, SelectChip, textStyles } from './ui';
import { SectionHeader } from './SectionHeader';
import { MatchCard } from './MatchCard';
import { IconText } from './Icon';
import { getSportMeta } from '../sports/sportMeta';
import { distanceLabel, homeCard, nearHeading, viewsLabel, type NearSection } from '../core/personalise';
import { askLocation, canAskLocation, currentLocation, locationChoice } from '../core/location';
import { nearMatches, type NearMatch, type NearResult, type Personalisation } from '../data/personalise';
import type { Match, SportId } from '../core/types';

const SHOW = 5;
const HIDE_CARD_KEY = 'sn.personalise.cardHiddenUntil';

export function NearYouSection({ personal, playerSports, canLocate, onOpen, onPersonalise }: {
  /** null: the server doesn't have personalised Home yet (nothing shown) */
  personal: Personalisation | null;
  /** PH-10: adults only; everyone else gets matches by city */
  canLocate: boolean;
  playerSports: SportId[];
  onOpen: (m: Match) => void;
  onPersonalise: () => void;
}) {
  const sports = useMemo(
    () => [...new Set([...(personal?.sports ?? []), ...playerSports])],
    [personal?.sports, playerSports],
  );
  const [res, setRes] = useState<NearResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<SportId | null>(null);
  const [offerLocation, setOfferLocation] = useState(false);
  const cityId = personal?.homeCity?.id ?? null;
  const key = `${sports.join(',')}|${cityId ?? ''}`;

  const load = useCallback(async () => {
    if (!personal) return;
    setLoading(true);
    try {
      const at = canLocate ? await currentLocation() : null;
      setOfferLocation(canLocate && !at && canAskLocation() && (await locationChoice()) === null);
      setRes(await nearMatches({ sports, at, cityId }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!personal, canLocate]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!personal) return null;
  const card = homeCard({ available: true, done: personal.done });

  if (res?.basis === 'none' || (!res && !loading && !cityId)) {
    // Not set up yet: the one "Finish setting up" card is enough (no second prompt).
    if (card) return <FinishCard onPersonalise={onPersonalise} />;
    return (
      <>
        <SectionHeader title="Near you" />
        <Card>
          <EmptyState icon="📍" title="See live matches near you" hint="Add your city (or allow location) and Home shows matches around you." compact />
          <Button label="Add my city" variant="ghost" onPress={onPersonalise} />
        </Card>
      </>
    );
  }

  const pick = (rows: NearMatch[]) => (only ? rows.filter((m) => m.sport === only) : rows);
  const live = pick(res?.live ?? []);
  const soon = pick(res?.soon ?? []);
  const recent = pick(res?.recent ?? []);
  const basis = res?.basis ?? 'city';
  const city = res?.city?.name ?? personal.homeCity?.name ?? null;
  const shownSports = [...new Set([...(res?.live ?? []), ...(res?.soon ?? []), ...(res?.recent ?? [])].map((m) => m.sport))];
  const note = (m: NearMatch) => [distanceLabel(m.distanceKm, basis), viewsLabel(m.views)].filter(Boolean).join('  ·  ') || null;
  // The sport filter sits under the first heading, so it reads as part of "Near you".
  const chips = shownSports.length > 1 ? (
    <View style={st.chips}>
      <SelectChip label="All" active={!only} onPress={() => setOnly(null)} />
      {shownSports.map((s) => (
        <SelectChip key={s} label={`${getSportMeta(s).icon} ${getSportMeta(s).name}`} active={only === s} onPress={() => setOnly(only === s ? null : s)} />
      ))}
    </View>
  ) : null;
  const list = (section: NearSection, rows: NearMatch[], first: boolean) => (
    <>
      <SectionHeader title={nearHeading({ basis, city, section })} count={rows.length} />
      {first ? chips : null}
      {rows.slice(0, SHOW).map((m) => <MatchCard key={m.id} match={m} note={note(m)} onPress={() => onOpen(m)} />)}
    </>
  );

  return (
    <>
      {card ? <FinishCard onPersonalise={onPersonalise} /> : null}
      {loading && !res ? (
        <>
          <SectionHeader title="Near you" />
          <LoadingState label="Finding matches near you…" />
        </>
      ) : error && !res ? (
        <>
          <SectionHeader title="Near you" />
          <EmptyState icon="📡" title="Couldn’t load matches near you" hint={error} compact />
        </>
      ) : (
        <>
          {live.length ? list('live', live, true) : (
            <>
              {soon.length ? list('soon', soon, true) : null}
              {recent.length ? list('recent', recent, !soon.length) : null}
              {!soon.length && !recent.length ? (
                <>
                  <SectionHeader title={nearHeading({ basis, city, section: 'live' })} />
                  {chips}
                  <EmptyState icon="📍" title="No matches near you right now"
                    hint={`Live matches${sports.length ? ' in your sports' : ''} within ${res?.radiusKm ?? 150} km show up here.`} compact />
                </>
              ) : null}
            </>
          )}
          {res?.allSports && (live.length || soon.length || recent.length) ? (
            <Text style={[textStyles.muted, st.aside]}>Nothing in your sports nearby right now, so here’s every sport.</Text>
          ) : null}
          {offerLocation ? (
            <TouchableOpacity accessibilityRole="button" onPress={async () => { await askLocation(); void load(); }}>
              <IconText style={st.link} label="📍 Use my location for the nearest matches" />
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </>
  );
}

/** For anyone who skipped: a small way back in, hidden for a week on "Not now". */
function FinishCard({ onPersonalise }: { onPersonalise: () => void }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(HIDE_CARD_KEY).then((v) => setHidden(!!v && Number(v) > Date.now())).catch(() => setHidden(false));
  }, []);
  if (hidden) return null;
  const later = () => {
    setHidden(true);
    AsyncStorage.setItem(HIDE_CARD_KEY, String(Date.now() + 7 * 24 * 3600_000)).catch(() => undefined);
  };
  return (
    <Card style={st.finish}>
      <IconText style={textStyles.h3} label="🏠 Finish setting up (1 min)" />
      <Text style={textStyles.muted}>Tell us your sports and city, and Home shows matches near you.</Text>
      <View style={st.finishRow}>
        <Button label="Not now" variant="ghost" onPress={later} style={{ flex: 1 }} />
        <Button label="Continue" variant="brand" onPress={onPersonalise} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  aside: { marginTop: -theme.spacing(1) },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small, paddingVertical: theme.spacing(1) },
  finish: { gap: theme.spacing(2) },
  finishRow: { flexDirection: 'row', gap: theme.spacing(3) },
});
