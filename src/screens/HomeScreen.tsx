/** Home — a lean, personalized feed. The header carries the app wordmark, a
 *  profile shortcut and the notification bell. A tournament switcher (scoped to
 *  the tournaments the user plays in or follows) filters the live & upcoming
 *  matches below, and a sport row jumps into each sport's section (schedule,
 *  organize, standings & stats). Deep standings/stats live on those pages. */
import { yourSports } from '../core/playedSports';
import { isStaleLive } from '../core/staleLive';
import { isOverdue } from '../core/overdue';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView } from '../components/keyboard';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../core/theme';
import { EmptyState, Card, LoadingState, Pill, SelectChip, QuickTile, textStyles, plural } from '../components/ui';
import { setStatusBarStyle } from 'expo-status-bar';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { Search, Bell, Menu, Zap, Trophy, Users } from 'lucide-react-native';
import { Glyph, IconText } from '../components/Icon';
import { formatDayShort } from '../core/dates';
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
import { canScoreByRole } from '../core/roles';
import type { Match, SportId, Tournament } from '../core/types';
import type { RootStackParamList } from '../navigation/types';
import { WebPushCard } from '../components/WebPushCard';
import { GuardianPendingCard } from '../components/GuardianPendingCard';
import { RequestsCard } from '../components/RequestsCard';
import { LinkByPhoneCard } from '../components/LinkByPhoneCard';
import { Logo } from '../components/Logo';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The first-run questions open by themselves at most once per app session. */
let askedThisSession = false;

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  // Three header buttons (🔍 🔔 ▾) leave a phone's wordmark ~140px — step it down so it isn't clipped.
  const { width } = useWindowDimensions();
  const narrow = width < 420;
  // 2026-10-29 redesign: light status-bar text over the pitch-green hero
  useFocusEffect(useCallback(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle('dark');
  }, []));
  const { profile } = useAuth();
  const tournaments = useMyTournaments(profile?.id);
  // Home is a personal feed: matches from what you follow (players/teams/
  // tournaments) plus your own — not every match app-wide.
  const { feed, loading } = useScopedMatches(profile?.id);
  const { unread } = useNotifications();

  // Selected tournament (null = "All"). Default to the first once loaded.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Quick actions (voice / friendly / calendar) live in a dropdown menu under one
  // toggle so the wordmark keeps its line; notifications stays always-visible.
  const [actionsOpen, setActionsOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (selectedId === null && tournaments.length === 1) setSelectedId(tournaments[0].id);
  }, [tournaments, selectedId]);
  const selected: Tournament | undefined = tournaments.find((t) => t.id === selectedId);

  const scoped = selectedId ? feed.filter((m) => m.tournamentId === selectedId) : feed;
  // MVP L11: a match left "live" with no activity for 12 hours isn't live
  const now = Date.now();
  const live = scoped.filter((m) => m.status === 'live' && !isStaleLive(m, now));
  // Postponed games still appear under "Up next" (badged) so followers learn of
  // the change; a cancelled game drops off the forward-looking feed.
  // …and a scheduled game 12 h+ past its start is overdue, not "up next" (OD1).
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

  const openSport = (sport: Match['sport']) => {
    // A specific tournament is needed for a sport section; default to the first
    // tournament that actually features the sport when "All" is selected.
    const t = selected ?? tournaments.find((x) => x.sports.includes(sport));
    if (t) return nav.navigate('SportHub', { tournamentId: t.id, sport, tournamentName: t.name });
    // None of MY tournaments features the sport: open my own stats in it (never a
    // stranger's tournament — tournaments[0] used to be anyone's).
    if (playerId) nav.navigate('SportProfile', { playerId, sport });
    else nav.navigate('Tabs', { screen: 'Discover', params: { in: 'tournaments' } });
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
          <View style={st.header}>
            <Logo size={38} />
            <View style={st.brand}>
              <Text style={[st.wordmark, narrow && st.wordmarkNarrow]} numberOfLines={1}>Sport<Text style={st.wordmarkAccent}>nNote</Text></Text>
            </View>
          <TouchableOpacity
            style={st.iconBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Search players, teams, matches and tournaments"
            onPress={() => nav.navigate('Tabs', { screen: 'Discover', params: { mode: 'people', focus: true } })}
          >
            <Search color={theme.colors.heroText} size={20} strokeWidth={2.2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={st.iconBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
            onPress={() => nav.navigate('Notifications')}
          >
            <Bell color={theme.colors.heroText} size={20} strokeWidth={2.2} />
            {unread > 0 && (
              <View style={st.badge}>
                <Text style={st.badgeText} maxFontSizeMultiplier={1.5}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={st.iconBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ expanded: actionsOpen }} aria-expanded={actionsOpen}
            accessibilityLabel="Quick actions"
            onPress={() => setActionsOpen((v) => !v)}
          >
            <Menu color={theme.colors.heroText} size={20} strokeWidth={2.2} />
          </TouchableOpacity>
          {/* Voice panel opens from the menu; the built-in mic trigger is hidden. */}
          <VoiceNav matches={feed} onOpenMatch={openScorer} open={voiceOpen} onOpenChange={setVoiceOpen} hideTrigger />
          </View>
          <View style={st.heroCopy}>
            {profile?.fullName ? <Text style={st.heroHello} numberOfLines={1}>Hi {profile.fullName.split(' ')[0]},</Text> : null}
            <Text style={st.heroTitle} accessibilityRole="header">Ready to{'\n'}<Text style={st.heroTitleLime}>play?</Text></Text>
            <Text style={st.heroTag}>Play a Sport, Make a Note.</Text>
          </View>
        </View>

        {/* The three big shortcuts */}
        <View style={st.quickRow}>
          <QuickTile label="Score a match" color={theme.colors.lime} ink={theme.colors.onLime}
            icon={<Zap color={theme.colors.onLime} size={26} strokeWidth={2.2} />}
            onPress={() => (canScore ? nav.navigate('ScheduleMatch', {}) : nav.navigate('Tabs', { screen: 'Matches' }))} />
          <QuickTile label="Organize" color={theme.colors.home} ink={theme.colors.onFill}
            icon={<Trophy color={theme.colors.onFill} size={26} strokeWidth={2.2} />}
            onPress={() => nav.navigate('Tabs', { screen: 'Organize' })} />
          <QuickTile label="Find players" color={theme.colors.hot} ink={theme.colors.onFill}
            icon={<Users color={theme.colors.onFill} size={26} strokeWidth={2.2} />}
            onPress={() => nav.navigate('Tabs', { screen: 'Discover', params: { mode: 'people', focus: true } })} />
        </View>

        {/* Quick actions as an anchored dropdown menu. */}
        <Modal visible={actionsOpen} transparent animationType="fade" onRequestClose={() => setActionsOpen(false)}>
          <Pressable style={st.menuBackdrop} onPress={() => setActionsOpen(false)} accessibilityRole="button" accessibilityLabel="Close menu">
            <View style={[st.menu, { top: insets.top + 60, right: theme.spacing(4) }]} onStartShouldSetResponder={() => true}>
              {[
                { icon: '🎙', label: 'Voice — find a game', onPress: () => setVoiceOpen(true) },
                ...(canScore ? [{ icon: '🤝', label: 'Start a friendly', onPress: () => nav.navigate('ScheduleMatch', {}) }] : []),
                { icon: '📅', label: 'Calendar', onPress: () => nav.navigate('Calendar') },
              ].map((item, idx) => (
                <React.Fragment key={item.label}>
                  {idx > 0 && <View style={st.menuDivider} />}
                  <TouchableOpacity
                    style={st.menuRow}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    onPress={() => { setActionsOpen(false); item.onPress(); }}
                  >
                    <Glyph emoji={item.icon} style={st.menuIcon} color={theme.colors.primary} />
                    <Text style={st.menuLabel}>{item.label}</Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          </Pressable>
        </Modal>

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

        {/* Tournament switcher */}
        {tournaments.length > 0 && (
          <View style={{ gap: theme.spacing(2) }}>
            <Text style={st.eyebrow}>Tournament</Text>
            <KeyboardAwareScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
              {tournaments.length > 1 && (
                <SelectChip label="All" active={selectedId === null} onPress={() => setSelectedId(null)} />
              )}
              {tournaments.map((t) => (
                <SelectChip key={t.id} label={t.name} active={selectedId === t.id} onPress={() => setSelectedId(t.id)} />
              ))}
            </KeyboardAwareScrollView>
            {selected && (
              <TouchableOpacity
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Open ${selected.name}`}
                onPress={() => nav.navigate('Tournament', { tournamentId: selected.id })}
              >
                <Card style={st.tourCard}>
                  <View style={{ flex: 1, gap: theme.spacing(1) }}>
                    <Text style={textStyles.body}>{selected.name}</Text>
                    <Text style={textStyles.muted}>
                      {selected.hostName} · {plural(selected.sports.length, 'sport')} · {formatDayShort(selected.startDate)} → {formatDayShort(selected.endDate)}
                    </Text>
                    {(() => {
                      const s = tournamentStatus(selected, matchProgress(feed.filter((m) => m.tournamentId === selected.id)));
                      return <View style={st.statusRow}><Pill label={s.label} color={s.color + '22'} textColor={s.color} /></View>;
                    })()}
                  </View>
                  <Text style={st.chevron}>›</Text>
                </Card>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Near you (founder 2026-10-31): their sports, around them */}
        <NearYouSection personal={personal} playerSports={mySports} canLocate={locationAllowed(player)}
          onOpen={openScorer} onPersonalise={() => nav.navigate('Personalise')} />

        {/* Live now — top 5, "See all" opens the full live list */}
        <SectionHeader title="Live now" count={live.length} onSeeAll={live.length > SECTION_CAP ? () => seeAll('live') : undefined} />
        {loading ? (
          <LoadingState label="Loading matches…" />
        ) : live.length ? (
          live.slice(0, SECTION_CAP).map((m) => <MatchCard key={m.id} match={m} onPress={() => openScorer(m)} />)
        ) : (
          <EmptyState icon="📡" title={personal ? 'None live from what you follow' : 'No live matches right now'}
            hint="Your matches and the teams, players and tournaments you follow show here the moment scoring starts." compact />
        )}
        <LiveGolfCards tournamentId={selectedId} />

        {/* Up next — top 5, "See all" opens the full upcoming list */}
        <SectionHeader title="Up next" count={upcoming.length} onSeeAll={upcoming.length > SECTION_CAP ? () => seeAll('upcoming') : undefined} />
        {loading ? (
          <LoadingState label="Loading…" />
        ) : upcoming.length ? (
          upcoming.slice(0, SECTION_CAP).map((m) => <MatchCard key={m.id} match={m} onPress={() => openScorer(m)} />)
        ) : (
          <EmptyState icon="📅" title="Nothing scheduled" hint="Upcoming matches will show up here." compact />
        )}

        {/* Your sports — the ones the user signed up for (schedule, standings,
            stats), plus a path into the ones they haven't. A plain list: the
            founder found the drawn court tiles too playful here (2026-10-29). */}
        <SectionHeader title="Your sports" />
        <Text style={textStyles.muted}>
          {mySports.length ? 'Schedule, standings and stats for each.' : 'Sports you sign up for will show up here.'}
        </Text>
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
  header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  brand: { flex: 1, gap: theme.spacing(1) },
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
