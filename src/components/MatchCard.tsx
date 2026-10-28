/** A match row used on Home and Schedule. Tapping opens the live-scoring screen.
 *
 *  Reads like a scoreboard: the two teams flank a bold central score, so a live
 *  or finished result is legible at a glance. Live matches are set apart with a
 *  red glow and a pulsing "LIVE" badge — this is a live-scoring app, so an
 *  in-progress game should never look like a scheduled one. */
import { teamLabel } from '../core/teamLevels';
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { theme } from '../core/theme';
import { useReducedMotion } from '../core/a11y';
import { getSport } from '../sports/registry';
import { getSportMeta } from '../sports/sportMeta';
import { openVenue } from '../core/venue';
import { formatShort, useUserTimeZone, zoneShortName } from '../core/time';
import type { Match } from '../core/types';
import { matchLine, resultWords } from '../sports/matchLine';
import { isTieMatch, fmtPts } from '../data/teamTie';
import { MapPin } from 'lucide-react-native';
import { SportArt } from './SportArt';

/** A stored snapshot from an older engine must never break a card. */
function safeLine(f: () => string): string {
  try { return f() || ''; } catch { return ''; }
}

/** A small dot that gently pulses — the universal "live" signal. */
function LiveBadge() {
  const pulse = useRef(new Animated.Value(1)).current;
  // SD-155: no endless pulse for people who asked the OS to reduce motion.
  const still = useReducedMotion();
  useEffect(() => {
    if (still) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, still]);
  return (
    <View style={s.liveBadge}>
      <Animated.View style={[s.liveDot, { opacity: pulse }]} />
      <Text style={s.liveText}>LIVE</Text>
    </View>
  );
}

/** `onStart` (parity #13): the scorer's one-tap "▶ Start scoring" / "Continue
 *  scoring" straight into the Scoring tab. */
export function MatchCard({ match, onPress, onStart, timeZone }: {
  match: Match; onPress: () => void; onStart?: () => void;
  /** SD-150: show kickoff in this zone (a tournament's venue zone), labelled
   *  ("Thu, 4:00 pm GST") when it isn't the viewer's own clock. */
  timeZone?: string;
}) {
  // Perf F-15: the name and icon come from the light meta; the full plugin is
  // read only for a played match's card line (the data layer loaded it).
  const sport = getSportMeta(match.sport);
  const viewerTz = useUserTimeZone(); // default: the viewer's own timezone
  const tz = timeZone || viewerTz;
  const otherClock = tz !== viewerTz && zoneShortName(tz, match.startsAt) !== zoneShortName(viewerTz, match.startsAt);
  const time = formatShort(match.startsAt, tz) + (otherClock && match.startsAt ? ` ${zoneShortName(tz, match.startsAt)}` : '');
  const live = match.status === 'live';
  // Play paused (drinks, rain, stumps…) — an amber BREAK tag instead of LIVE.
  const onBreak = live && !!match.onBreak;
  const done = match.status === 'completed';
  const postponed = match.status === 'postponed';
  const cancelled = match.status === 'cancelled';
  const walkover = done && match.walkover;
  const showScore = (live || done) && !!match.score && !walkover;
  // SD-01/SD-20: a finished set/game match shows its per-set line under the
  // sets/games score ("21-18, 19-21, 21-15"; tennis "6-4, 3-6, 7-6(4)"; closed by
  // hand "6-4, 3-2 ret."). A walkover already reads W/O in the middle.
  const setLine = done && showScore ? matchLine(match) : '';
  // SD-56: football's half-time score ("HT 1-0") under a live / final score.
  // SD-48: a team tie shown as one fixture (rubbers won; ½ for chess draws)
  const tie = isTieMatch(match);
  const plugin = showScore && !setLine && match.state ? getSport(match.sport) : null;
  const cardLine = plugin?.cardLine ? safeLine(() => plugin.cardLine!(match.state as never)) : '';

  return (
    // The start button sits beside (not inside) the card's touchable — a button
    // can't nest inside another button on web.
    <View style={[s.card, live && s.cardLive]}>
    {/* 2026-10-29 redesign: a strip of the sport's court across the top */}
    <SportArt sport={match.sport} style={s.strip} variant="strip" />
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${sport.name}: ${teamLabel(match.homeTeam)} versus ${teamLabel(match.awayTeam)}${
        showScore ? `, ${match.score!.home} to ${match.score!.away}${setLine ? ` (${setLine})` : ''}${cardLine ? ` (${cardLine})` : ''}` : ''
      }, ${onBreak ? 'on a break' : live ? 'live now' : done ? 'final' : time}`}
      style={s.body}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={s.top}>
        <Text style={s.sport} numberOfLines={1}>{sport.name}</Text>
        {onBreak ? (
          <Text style={s.breakTag}>⏸ BREAK</Text>
        ) : live ? (
          <LiveBadge />
        ) : done ? (
          <Text style={s.finalTag}>FINAL</Text>
        ) : cancelled ? (
          <Text style={s.cancelledTag}>CANCELLED</Text>
        ) : postponed ? (
          <Text style={s.postponedTag}>POSTPONED</Text>
        ) : (
          <Text style={s.timeTag}>{time}</Text>
        )}
      </View>

      {/* Scoreboard: team · score · team */}
      <View style={s.board}>
        <View style={[s.side, s.sideLeft]}>
          <Text style={s.team} numberOfLines={1}>{teamLabel(match.homeTeam)}</Text>
          <View style={[s.dot, { backgroundColor: match.homeTeam.colorHex }]} />
        </View>

        {showScore ? (
          <View style={s.scoreWrap}>
            <Text style={[s.score, live && s.scoreLive]}>{tie ? fmtPts(match.score!.home) : match.score!.home}</Text>
            <Text style={s.scoreSep}>–</Text>
            <Text style={[s.score, live && s.scoreLive]}>{tie ? fmtPts(match.score!.away) : match.score!.away}</Text>
          </View>
        ) : walkover ? (
          <Text style={s.walkover}>W/O</Text>
        ) : (
          <Text style={s.vs}>vs</Text>
        )}

        <View style={[s.side, s.sideRight]}>
          <View style={[s.dot, { backgroundColor: match.awayTeam.colorHex }]} />
          <Text style={s.team} numberOfLines={1}>{teamLabel(match.awayTeam)}</Text>
        </View>
      </View>

      {setLine ? <Text style={s.setLine} numberOfLines={1}>{setLine}</Text> : null}
      {cardLine ? <Text style={s.setLine} numberOfLines={1}>{cardLine}</Text> : null}

      {/* Footer: call-to-action / kickoff, plus venue */}
      <Text style={s.foot}>
        {tie ? (
          `👥 Team tie · ${match.tieRubbers.length} rubbers${done ? '' : live ? ' · in progress' : ` · ${time}`}`
        ) : live ? (
          <Text style={s.cta}>Tap to score ›</Text>
        ) : done ? (
          match.result ? resultWords({ sport: match.sport, result: match.result }, match.homeTeam.name, match.awayTeam.name) : walkover ? 'Walkover' : 'Full time'
        ) : (
          time
        )}
        {match.venueName ? (
          <>
            {'  ·  '}
            <Text
              style={s.venue}
              accessibilityRole="link"
              accessibilityLabel={`Map: ${match.venueName}`}
              onPress={() => openVenue(match.venueName, match.venueMapsUrl)}
              suppressHighlighting
            >
              <MapPin color={theme.colors.textMuted} size={12} strokeWidth={2.2} /> <Text style={s.venueText}>{match.venueName}</Text>
            </Text>
          </>
        ) : null}
      </Text>
    </TouchableOpacity>
      {onStart && (live || match.status === 'scheduled') ? (
        <TouchableOpacity style={s.startBtn} activeOpacity={0.85} accessibilityRole="button"
          accessibilityLabel={live ? 'Continue scoring' : 'Start scoring'} onPress={onStart}>
          <Text style={s.startText}>{live ? '▶ Continue scoring' : '▶ Start scoring'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg - 4,
    borderWidth: 1,
    borderColor: theme.colors.surfaceAlt,
    paddingBottom: theme.spacing(4),
    gap: theme.spacing(3),
    overflow: 'hidden',
    ...theme.shadow.card,
  },
  strip: { height: 40 },
  body: { gap: theme.spacing(3), paddingHorizontal: theme.spacing(4) },
  cardLive: {
    borderColor: theme.colors.danger + '66',
    ...theme.shadow.live,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sport: { flexShrink: 1, color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    backgroundColor: theme.colors.dangerStrong,
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(2),
    borderRadius: theme.radius.pill,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
  liveText: { color: '#FFFFFF', fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.8 },
  finalTag: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  postponedTag: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  cancelledTag: { color: theme.colors.danger, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5 },
  breakTag: { color: theme.colors.accent, backgroundColor: theme.colors.accent + '22', fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.5, paddingVertical: theme.spacing(1), paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.pill, overflow: 'hidden' },
  startBtn: { backgroundColor: theme.colors.lime, borderRadius: theme.radius.pill, paddingVertical: theme.spacing(2.5), alignItems: 'center', marginHorizontal: theme.spacing(4) },
  startText: { color: theme.colors.onLime, fontSize: theme.font.small, fontWeight: '800', letterSpacing: 0.4 },
  timeTag: { color: theme.colors.hot, fontSize: theme.font.tiny, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },

  board: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  sideLeft: { justifyContent: 'flex-end' },
  sideRight: { justifyContent: 'flex-start' },
  team: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700', flexShrink: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },

  scoreWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingHorizontal: theme.spacing(1) },
  score: { color: theme.colors.text, fontSize: 34, fontFamily: theme.fonts.numeral, minWidth: 20, textAlign: 'center' },
  scoreLive: { color: theme.colors.primary },
  setLine: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  scoreSep: { color: theme.colors.textMuted, fontSize: theme.font.h3, fontWeight: '700' },
  vs: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(2) },
  walkover: { color: theme.colors.textMuted, fontSize: theme.font.small, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: theme.spacing(2) },

  foot: { color: theme.colors.textMuted, fontSize: theme.font.small },
  cta: { color: theme.colors.primary, fontWeight: '800' },
  venue: { color: theme.colors.textMuted, fontSize: theme.font.small },
  venueText: { textDecorationLine: 'underline' },
});
