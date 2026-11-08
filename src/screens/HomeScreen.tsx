/** Home — a lean, personalized feed. The header carries the app wordmark, a
 *  profile shortcut and the notification bell. A tournament switcher (scoped to
 *  the tournaments the user plays in or follows) filters the live & upcoming
 *  matches below, and a sport row jumps into each sport's section (schedule,
 *  organize, standings & stats). Deep standings/stats live on those pages. */
import { SkeletonList } from '../components/Skeleton';
import { distinctNames } from '../core/chipNames';
import { yourSports, mostPlayedSport } from '../core/playedSports';
import { isStaleLive } from '../core/staleLive';
import { isOverdue } from '../core/overdue';
import React, { useMemo, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, useWindowDimensions, Platform } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, LoadingState, Pill, SelectChip, Button, textStyles, plural } from '../components/ui';
import { weekLine, heroSportChips, heroGreeting, heroFontSize, tournamentCards, sportsSummary, sportTarget } from '../core/homeHero';
import { matchOutbox } from '../data/matchOutbox';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { Zap, Trophy, UserPlus } from 'lucide-react-native';
import { Glyph, IconText } from '../components/Icon';
import { formatDayShort, formatDayRange } from '../core/dates';
import { MatchCard } from '../components/MatchCard';
import { LiveGolfCards } from '../components/golf/LiveGolfCards';
import { SectionHeader, SECTION_CAP } from '../components/SectionHeader';
import { VoiceNav } from '../components/VoiceNav';
import { SPORT_LIST, getSportMeta } from '../sports/sportMeta';
import { tournamentStatus, matchProgress } from '../core/tournament';
import { isSupabaseConfigured } from '../core/supabase';
import { matchEligibility } from '../core/eligibility';
import { useMyTournaments, useScopedMatches, useNotifications, usePlayerLite } from '../data/hooks';
import { getMyPlayerId } from '../data/repos';
import { NearYouSection } from '../components/NearYouSection';
import { getMyPersonalisation, type Personalisation } from '../data/personalise';
import { locationAllowed, shouldAutoOpen } from '../core/personalise';
import { markOnboardingSeen } from '../core/onboarding';
import { onboardingStore } from '../data/onboardingStore';
import { useAuth } from '../core/auth';
import { canScoreByRole, canStartFriendly } from '../core/roles';
import type { Match, SportId, Tournament } from '../core/types';
import type { RootStackParamList, TabParamList } from '../navigation/types';
import { WebPushCard } from '../components/WebPushCard';
import { GuardianPendingCard } from '../components/GuardianPendingCard';
import { RequestsCard } from '../components/RequestsCard';
import { LinkByPhoneCard } from '../components/LinkByPhoneCard';
import { BrandBar } from '../components/BrandBar';
import { barPlacement } from '../core/brandBar';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The first-run questions open by themselves at most once per app session. */
let askedThisSession = false;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  // Three header buttons (🔍 🔔 ▾) leave a phone's wordmark ~140px — step it down so it isn't clipped.
  const { width } = useWindowDimensions();
  const narrow = width < 420;
  const barHere = barPlacement({ os: Platform.OS, width, authed: true, route: 'Home' }).screen;
  const { profile } = useAuth();
  const tournaments = useMyTournaments(profile?.id);
  // UI audit step 5: repeated names get the detail that tells them apart
  const chipNames = useMemo(() => distinctNames(tournaments, (d) => formatDayRange(d, null).replace(/^from /, '')), [tournaments]);
  // Home is a personal feed: matches from what you follow (players/teams/
  // tournaments) plus your own — not every match app-wide.
  const { feed, loading } = useScopedMatches(profile?.id);
  const { unread } = useNotifications();

  // Quick actions (voice / friendly / calendar) live in a dropdown menu under one
  // toggle so the wordmark keeps its line; notifications stays always-visible.
  const [voiceOpen, setVoiceOpen] = useState(false);
  // BB6: "Voice — find a game" from the bar on another screen opens Home with voice: true
  const route = useRoute<RouteProp<TabParamList, 'Home'>>();
  useEffect(() => {
    if (route.params?.voice) { setVoiceOpen(true); nav.setParams?.({ voice: undefined } as never); }
  }, [route.params?.voice]);
  const [heroW, setHeroW] = useState(0);
  const insets = useSafeAreaInsets();
  // home-sports.md HS5: no tournament filter; the tournament cards open each one
  const scoped = feed;
  // MVP L11: a match left "live" with no activity for 12 hours isn't live
  const now = Date.now();
  const live = scoped.filter((m) => m.status === 'live' && !isStaleLive(m, now));
  // Postponed games still appear under "Up next" (badged) so followers learn of
  // the change; a cancelled game drops off the forward-looking feed.
  // …and a scheduled game 12 h+ past its start is overdue, not "up next" (OD1).
  // Stitch pick 17: the scorer's own online flag
  useSyncExternalStore(matchOutbox.subscribe, matchOutbox.getSnapshot);
  const online = matchOutbox.isOnline();
  const upcoming = scoped.filter((m) => (m.status === 'scheduled' || m.status === 'postponed') && !isOverdue(m, now));

  // "Explore a sport" = the sports the user has signed up for (their profile's
  // declared sports); the rest are offered under "Try a new sport".
  const [playerId, setPlayerId] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      getMyPlayerId(profile?.id).then((id) => on && setPlayerId(id));
      return () => {
        on = false;
      };
    }, [profile?.id])
  );
  const { player } = usePlayerLite(playerId); // perf F-09: no stats reads on Home
  // Personalised Home (founder 2026-10-31): the first-run questions open by
  // themselves from Home only (never over a match or invite link someone opened
  // at the ground), once; Skip is remembered. Home then shows "Near you".
  const [personal, setPersonal] = useState<Personalisation | null>(null);
  useFocusEffect(
    useCallback(() => {
      let on = true;
      if (!profile?.id) { setPersonal(null); return; }
      getMyPersonalisation().then((p) => {
        if (!on) return;
        setPersonal(p);
        if (!askedThisSession && shouldAutoOpen({ available: !!p, signedIn: true, done: !!p?.done, skipped: !!p?.skipped, deepLinked: false })) {
          askedThisSession = true;
          void markOnboardingSeen();
          onboardingStore.done();
          nav.navigate('Personalise');
        }
      }).catch(() => undefined);
      return () => { on = false; };
    }, [profile?.id, nav])
  );
  // Post-login nudge: prompt the user to finish verifying so they can be added to
  // matches (the eligibility gate needs a verified mobile + email; guardian for
  // minors). Email auto-verifies from the confirmed login; mobile is the usual
  // one left. Dismissible for the session; reappears until they're eligible.
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const elig = player ? matchEligibility(player) : { ok: true };
  const showVerify = isSupabaseConfigured && !!player && !elig.ok && !verifyDismissed;
  const verifyPrompt = (reason?: string): string => {
    const r = reason ?? '';
    if (r.includes('Mobile')) return 'Verify your mobile number to join matches & tournaments.';
    if (r.includes('Email')) return 'Verify your email to join matches & tournaments.';
    if (r.includes('Date of birth')) return 'Add your date of birth to join matches.';
    if (/guardian|Guardian|proof/.test(r)) return 'Complete parent/guardian verification to join matches.';
    return 'Finish verifying your account to join matches.';
  };
  const allSports = SPORT_LIST.map((s) => s.id);
  // founder 2026-11-04: the sports you picked, then every sport you've played, scored or hosted
  const mySports = yourSports(player?.sports, feed, playerId).filter((s) => allSports.includes(s));
  const newSports = allSports.filter((s) => !mySports.includes(s));

  const canScore = canScoreByRole(profile?.role);
  const canStart = canStartFriendly(profile?.role);
  const openScorer = (m: Match) =>
    nav.navigate('LiveScoring', {
      matchId: m.id, sport: m.sport,
      homeName: m.homeTeam.shortName, awayName: m.awayTeam.shortName,
      homeTeamName: m.homeTeam.name, awayTeamName: m.awayTeam.name,
      homeColor: m.homeTeam.colorHex, awayColor: m.awayTeam.colorHex,
      canScore,
    });

  // "See all" opens the full Matches browser at the matching section.
  const seeAll = (initialTab: 'live' | 'upcoming') => nav.navigate('Tabs', { screen: 'Matches', params: { initialTab } });

  // HS3: the same place as on the Your sports page
  const openSport = (sport: Match['sport']) => {
    const to = sportTarget(sport, tournaments, playerId);
    (nav.navigate as (name: string, params: object) => void)(to.name, to.params);
  };

  return (
    <SafeAreaView style={st.safe} edges={[]}>
      <KeyboardAwareScrollView contentContainerStyle={st.content}>
        {/* 2026-10-29 redesign: the pitch-green hero — wordmark, search,
            notifications, menu, and the headline */}
        <View style={[st.hero, { paddingTop: insets.top + theme.spacing(3) }]}>
          <Svg style={st.heroArt} width={220} height={220} viewBox="0 0 100 100" pointerEvents="none">
            <Circle cx={70} cy={30} r={26} fill={theme.colors.lime} opacity={0.9} />
            <Rect x={8} y={8} width={84} height={84} stroke={theme.colors.heroText} strokeOpacity={0.12} strokeWidth={1.2} fill="none" />
            <Line x1={8} y1={50} x2={92} y2={50} stroke={theme.colors.heroText} strokeOpacity={0.12} strokeWidth={1.2} />
            <Circle cx={50} cy={50} r={12} stroke={theme.colors.heroText} strokeOpacity={0.12} strokeWidth={1.2} fill="none" />
          </Svg>
          {/* brand-bar.md: the shared top bar; on wide web the root draws it instead (BB4) */}
          {barHere ? <BrandBar embedded onHome onVoice={() => setVoiceOpen(true)} /> : null}
          {/* Voice panel opens from the bar's menu; the built-in mic trigger is hidden. */}
          <VoiceNav matches={feed} onOpenMatch={openScorer} open={voiceOpen} onOpenChange={setVoiceOpen} hideTrigger />
          <View style={st.heroCopy}>
            {/* Round 2 (HM9/HM10): one line, "Ready to play, Aarav?", sized to fit */}
            {(() => {
              const g = heroGreeting(profile?.fullName);
              const size = heroFontSize(`${g.lead}${g.accent}`, heroW);
              return (
                <View onLayout={(e) => setHeroW(e.nativeEvent.layout.width)}>
                  <Text style={[st.heroTitle, { fontSize: size, lineHeight: size * 1.05 }]} numberOfLines={1} accessibilityRole="header">
                    {g.lead}<Text style={st.heroTitleLime}>{g.accent}</Text>
                  </Text>
                </View>
              );
            })()}
            <Text style={st.heroTag}>Play a Sport, Make a Note.</Text>
            {/* Stitch picks 12–13: your sports, and what's coming this week (HM2/HM3) */}
            {(() => {
              const chips = heroSportChips(mySports);
              const week = weekLine(feed, now);
              return (
                <>
                  {chips.shown.length ? (
                    <View style={st.heroChips}>
                      {chips.shown.map((sp) => <Text key={sp} style={st.heroChip}>{getSportMeta(sp).icon} {getSportMeta(sp).name}</Text>)}
                      {chips.more ? <Text style={st.heroChip}>+{chips.more}</Text> : null}
                    </View>
                  ) : null}
                  {week ? <IconText label={`📅 ${week}`} style={st.heroWeek} /> : null}
                </>
              );
            })()}
          </View>
        </View>

        {/* Round 2 (HM8, founder's pick): three tiles, only Score a match in lime */}
        <View style={st.quickRow}>
          <HomeTile lime label="Score a match" icon={<Zap color={theme.colors.onLime} size={22} strokeWidth={2.2} />} onPress={() => nav.navigate('ScheduleMatch', {})} />
          <HomeTile label="Organize" icon={<Trophy color={theme.colors.primary} size={22} strokeWidth={2.2} />} onPress={() => nav.navigate('Tabs', { screen: 'Organize' })} />
          <HomeTile label="Find players" icon={<UserPlus color={theme.colors.primary} size={22} strokeWidth={2.2} />} onPress={() => nav.navigate('Tabs', { screen: 'Discover', params: { mode: 'people', focus: true } })} />
        </View>
        {/* Stitch pick 17 (HM6): only while offline */}
        {!online ? (
          <Card style={st.offline}>
            <Text style={[textStyles.body, { fontWeight: '700' }]}>You're offline</Text>
            <Text style={textStyles.muted}>Scores you record are kept on this phone and sent once you're back online.</Text>
          </Card>
        ) : null}


        {/* Web app: nudge to turn on notifications (iPhone: Add to Home Screen first). */}
        <WebPushCard compact />
        {/* SD-152: under-18 outside India, guardian hasn't confirmed yet. */}
        <GuardianPendingCard />
        {/* Security Wave 2b: links / friendlies waiting for our answer; W1-2b link by phone. */}
        <RequestsCard />
        <LinkByPhoneCard />

        {!isSupabaseConfigured && (
          <Card style={st.demo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Glyph emoji="🧪" style={{ fontSize: 16 }} color={theme.colors.primary} />
              <Text style={textStyles.body}>Demo mode</Text>
            </View>
            <Text style={textStyles.muted}>
              Running on local sample data. Tap any match to open the live scorer — it works fully offline.
            </Text>
          </Card>
        )}

        {showVerify && (
          <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} onPress={() => nav.navigate('Tabs', { screen: 'Profile' })}>
            <Card style={st.verifyCard}>
              <View style={st.verifyRow}>
                <IconText label={"🔐 Finish setting up your account"} style={st.verifyTitle} />
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={(e) => { e.stopPropagation?.(); setVerifyDismissed(true); }}>
                  <Glyph emoji="✕" style={st.verifyClose} />
                </TouchableOpacity>
              </View>
              <Text style={textStyles.muted}>{verifyPrompt(elig.reason)} Tap to verify →</Text>
            </Card>
          </TouchableOpacity>
        )}

        {/* Near you (founder 2026-10-31): their sports, around them */}
        <NearYouSection personal={personal} playerSports={mySports} canLocate={locationAllowed(player)}
          onOpen={openScorer} onPersonalise={() => nav.navigate('Personalise')} />

        {/* Live now — top 5, "See all" opens the full live list */}
        <SectionHeader title="Live now" count={live.length} onSeeAll={live.length > SECTION_CAP ? () => seeAll('live') : undefined} />
        {loading ? (
          <SkeletonList loading rows={2} label="Loading matches" />
        ) : live.length ? (
          live.slice(0, SECTION_CAP).map((m) => <MatchCard key={m.id} match={m} compact onPress={() => openScorer(m)} />)
        ) : (
          <EmptyState icon="📡" title={personal ? 'None live from what you follow' : 'No live matches right now'}
            hint="Your matches and the teams, players and tournaments you follow show here the moment scoring starts." compact />
        )}
        <LiveGolfCards tournamentId={null} />

        {/* Up next — top 5, "See all" opens the full upcoming list */}
        <SectionHeader title="Up next" count={upcoming.length} onSeeAll={upcoming.length > SECTION_CAP ? () => seeAll('upcoming') : undefined} />
        {loading ? (
          <LoadingState label="Loading…" />
        ) : upcoming.length ? (
          upcoming.slice(0, SECTION_CAP).map((m) => <MatchCard key={m.id} match={m} compact onPress={() => openScorer(m)} />)
        ) : (
          <EmptyState icon="📅" title="Nothing scheduled" hint="Upcoming matches will show up here." compact />
        )}

        {/* Round 2 (HM11/HM12): your tournaments, side by side — swipe for more */}
        {tournaments.length > 0 ? (
          <>
            <SectionHeader title="Your tournaments" onSeeAll={() => nav.navigate('Tabs', { screen: 'Organize' })} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tourRow}>
              {tournamentCards(tournaments, feed).map(({ tournament: t, sports, teams, pct }) => {
                const s = tournamentStatus(t, matchProgress(feed.filter((m) => m.tournamentId === t.id)));
                return (
                  <TouchableOpacity key={t.id} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Open ${t.name}`}
                    onPress={() => nav.navigate('Tournament', { tournamentId: t.id })} style={st.tourTile}>
                    <View style={st.tourTop}>
                      <Text style={st.tourDates} numberOfLines={1}>{formatDayRange(t.startDate, t.endDate).toUpperCase()}</Text>
                      <Pill label={s.label} color={s.color + '22'} textColor={s.color} />
                    </View>
                    <Text style={st.tourName} numberOfLines={2}>{t.name}</Text>
                    <Text style={textStyles.muted} numberOfLines={1}>{[plural(sports, 'sport'), teams ? plural(teams, 'team') : null].filter(Boolean).join(' · ')}</Text>
                    {pct !== null ? (
                      <View style={st.progressWrap} accessible accessibilityLabel={`${pct} percent of the matches played`}>
                        <View style={st.progressRow}>
                          <Text style={textStyles.muted}>Matches played</Text>
                          <Text style={st.progressPct}>{pct}%</Text>
                        </View>
                        <View style={st.progressTrack}><View style={[st.progressFill, { width: `${pct}%` }]} /></View>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {/* Your sports — the ones the user signed up for (schedule, standings,
            stats), plus a path into the ones they haven't. A plain list: the
            founder found the drawn court tiles too playful here (2026-10-29). */}
        <SectionHeader title="Your sports" />
        <Text style={textStyles.muted}>
          {mySports.length ? 'Schedule, standings and stats for each.' : 'Sports you sign up for will show up here.'}
        </Text>
        {/* Round 3 (HM13/HM14): many sports fold into one row, like "Try a new sport";
            it opens its own page, as that one does (home-sports.md HS2) */}
        {sportsSummary(mySports).folded ? (() => {
          const sum = sportsSummary(mySports);
          // HS1: the sport you've played most, else a generic medal
          const top = mostPlayedSport(mySports, feed, playerId);
          return (
            <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} style={st.tryTile}
              accessibilityLabel={`Your ${mySports.length} sports`} onPress={() => nav.navigate('YourSports')}>
              <Text style={st.sportIcon}>{top ? getSportMeta(top).icon : '🏅'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[textStyles.body, { fontWeight: '700' }]}>Your {mySports.length} sports</Text>
                <Text style={textStyles.muted} numberOfLines={1}>{sum.names.map((x) => getSportMeta(x).name).join(', ')} +{sum.more} more</Text>
              </View>
              <Text style={st.chevron}>›</Text>
            </TouchableOpacity>
          );
        })() : (
        <View style={st.sportGrid}>
          {mySports.map((s) => (
            <TouchableOpacity
              key={s}
              activeOpacity={0.85}
              style={st.sportTile}
              accessibilityRole="button"
              accessibilityLabel={`Open ${getSportMeta(s).name}`}
              onPress={() => openSport(s)}
            >
              <Text style={st.sportIcon}>{getSportMeta(s).icon}</Text>
              <Text style={[textStyles.body, { flex: 1 }]} numberOfLines={1}>{getSportMeta(s).name}</Text>
              <Text style={st.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
        )}
        {newSports.length > 0 && (
          <TouchableOpacity accessibilityRole="button"
            activeOpacity={0.85}
            style={st.tryTile}
            onPress={() => nav.navigate('TryNewSport', { sports: newSports })}
          >
            <Glyph emoji="✨" style={st.sportIcon} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[textStyles.body, { fontWeight: '700' }]}>Try a new sport</Text>
              <Text style={textStyles.muted} numberOfLines={1}>
                {newSports.slice(0, 3).map((s) => getSportMeta(s).name).join(', ')}{newSports.length > 3 ? ` +${newSports.length - 3} more` : ''}
              </Text>
            </View>
            <Text style={st.chevron}>›</Text>
          </TouchableOpacity>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

/** Round 2 (HM8): a Home shortcut tile — an icon in a circle over a short label;
 *  only the main job (Score a match) is lime. */
function HomeTile({ label, icon, onPress, lime }: { label: string; icon: React.ReactNode; onPress: () => void; lime?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label} style={[st.tile, lime && st.tileLime]}>
      <View style={[st.tileIcon, lime && st.tileIconLime]}>{icon}</View>
      <Text style={[st.tileLabel, lime && { color: theme.colors.onLime }]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), paddingTop: 0, gap: theme.spacing(3) },
  // the pitch-green hero, edge to edge under the status bar
  hero: {
    marginHorizontal: -theme.spacing(4), paddingHorizontal: theme.spacing(4), paddingBottom: theme.spacing(10),
    backgroundColor: theme.colors.primaryDark, borderBottomLeftRadius: theme.radius.xl, borderBottomRightRadius: theme.radius.xl,
    overflow: 'hidden', gap: theme.spacing(5),
  },
  heroArt: { position: 'absolute', right: -70, top: 70 },
  heroCopy: { gap: theme.spacing(1) },
  heroHello: { color: theme.colors.heroMuted, fontSize: theme.font.body, fontWeight: '700' },
  heroTitle: { color: theme.colors.heroText, fontFamily: theme.fonts.display, fontSize: theme.font.display, lineHeight: theme.font.display * 0.98, textTransform: 'uppercase' },
  heroTitleLime: { color: theme.colors.lime },
  heroTag: { color: theme.colors.heroMuted, fontSize: theme.font.body, marginTop: theme.spacing(1) },
  quickRow: { flexDirection: 'row', gap: theme.spacing(2), marginTop: -theme.spacing(8) },
  tile: { flex: 1, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: theme.spacing(2), padding: theme.spacing(2), borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, ...theme.shadow.card },
  tileLime: { backgroundColor: theme.colors.lime },
  tileIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt },
  tileIconLime: { backgroundColor: 'rgba(20,24,29,0.10)' },
  tileLabel: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center' },
  tourRow: { gap: theme.spacing(3), paddingVertical: theme.spacing(1), paddingRight: theme.spacing(4) },
  tourTile: { width: 250, gap: theme.spacing(1.5), padding: theme.spacing(3), borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow.card },
  tourTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  tourDates: { flexShrink: 1, color: theme.colors.hot, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.4 },
  tourName: { fontFamily: theme.fonts.heading, fontSize: theme.font.h3 + 2, color: theme.colors.text },
  flex1: { flex: 1, backgroundColor: theme.colors.surface },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1.5), marginTop: theme.spacing(2) },
  heroChip: { color: theme.colors.heroText, fontSize: theme.font.small, fontWeight: '700', backgroundColor: 'rgba(243,240,232,0.14)', paddingHorizontal: theme.spacing(2.5), paddingVertical: theme.spacing(1), borderRadius: theme.radius.pill, overflow: 'hidden' },
  heroWeek: { color: theme.colors.lime, fontSize: theme.font.small, fontWeight: '700', marginTop: theme.spacing(2) },
  offline: { gap: theme.spacing(1), borderColor: theme.colors.accent },
  progressWrap: { gap: theme.spacing(1), marginTop: theme.spacing(2) },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressPct: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: theme.colors.primary },
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  brand: { flex: 1, gap: theme.spacing(1), alignItems: 'flex-start' },
  brandBadge: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(1.5), backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm, paddingVertical: 4, paddingLeft: 4, paddingRight: theme.spacing(2) },
  // The wordmark in the headline face, leaning like the logo (no fontWeight: Android
  // would swap a custom family for the system font).
  wordmark: { color: theme.colors.heroText, fontSize: 28, fontFamily: theme.fonts.display, letterSpacing: 0.2 },
  wordmarkNarrow: { fontSize: 25 },
  wordmarkAccent: { color: theme.colors.lime },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  icon: { fontSize: 20 },
  // The quick-actions toggle is a text glyph (not an emoji), so it needs an
  // explicit, high-contrast colour — the accent makes it clearly tappable.
  toggleGlyph: { fontSize: 16, color: theme.colors.primary, fontWeight: '900', lineHeight: 18 },
  menuBackdrop: { flex: 1 },
  menu: { position: 'absolute', minWidth: 232, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(1), shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4) },
  menuIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  menuLabel: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  menuDivider: { height: 1, backgroundColor: theme.colors.border, marginHorizontal: theme.spacing(3) },
  badge: {
    position: 'absolute', top: -2, right: -2, minWidth: 20, minHeight: 20, borderRadius: 10,
    backgroundColor: theme.colors.dangerStrong, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: theme.colors.primaryDark,
  },
  badgeText: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '800' },
  demo: { backgroundColor: theme.colors.surfaceAlt, gap: theme.spacing(1) },
  verifyCard: { gap: theme.spacing(1), borderColor: theme.colors.accent, borderWidth: 1 },
  verifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  verifyTitle: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800', flex: 1 },
  verifyClose: { color: theme.colors.textMuted, fontSize: theme.font.body, fontWeight: '800' },
  eyebrow: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  chips: { gap: theme.spacing(2), paddingVertical: theme.spacing(1) },
  tourCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  statusRow: { flexDirection: 'row', marginTop: theme.spacing(1) },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
  sportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  sportTile: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(3),
    width: '48%',
  },
  sportIcon: { fontSize: 22 },
  tryTile: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3),
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.primary,
    paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4),
  },
});
