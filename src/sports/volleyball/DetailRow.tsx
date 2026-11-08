/**
 * SD-81 + deep wave — volleyball's optional "Stats to track" row under the
 * point panels. Every prompt is optional (the point buttons stay one or two
 * taps); a NEW match starts with reception, digs, set by and who was aced on
 * (settings.ts VB_STATS_DEFAULTS), attack attempts off. The
 * categories are chosen in ⚙️ Stats to track (settings.ts); the inline chip
 * turns the chosen ones on / off. With a category on it adds:
 *   attack     after a Block point: "Who was blocked?" (an attack attempt
 *              that was blocked); "⚡ Attack in play" per side (a swing that
 *              didn't end the rally — no score change);
 *   reception  after an Ace: "Who was aced?" (a reception error);
 *              "📥 Reception" per side: grade (# / + / −), then the receiver;
 *   dig        "🛡️ Dig" per side → the digger;
 *   assist     after an Attack point: "Set by?" (the setter — a set assist);
 *   aced       (batch 5) after an Ace: "Who was aced?" on its own.
 * describe-court-team (wave 2): the three "after the point" rows (Set by? /
 * Who was blocked? / Who was aced?) are one "Last point" DescribeCard keyed by
 * the point's event id — Done / Skip, "✓ Saved · … Edit", a fresh card on the
 * next point. Each entry names its point (`pt`), so a late tap never lands
 * on a newer one (DC9).
 * Every prompt is skippable; a second tap replaces the answer. Kills come from
 * Attack points and attack errors from "Opp. fault › Attack out" with the
 * attacker named, so they need no extra tap. Every entry is a VB_DETAIL (undo
 * removes it). See ./detail.ts.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { SelectChip } from '../../components/ui';
import { DescribeCard, useDescribeMarks } from '../../components/DescribeCard';
import type { Player } from '../../core/types';
import type { ScoreAction } from '../types';
import type { VolleyballState } from './engine';
import { detailAction } from './actions';
import { detailCats, detailOn, entryFor, lastScored, RECEPTION_GRADES, type ReceptionGrade, type VbDetailCat, type VbDetailKind } from './detail';

type Side = 'home' | 'away';
interface SideInfo { side: Side; name: string; color: string; court: Player[] }

const CAT_LABEL: Record<VbDetailCat, string> = { attack: 'Attack', reception: 'Reception', dig: 'Digs', assist: 'Set assists', aced: 'Who was aced' };

export function VolleyballDetailRow({ state: s, dispatch, home, away }: {
  state: VolleyballState;
  dispatch: (a: ScoreAction) => void;
  home: SideInfo;
  away: SideInfo;
}) {
  const on = detailOn(s);
  const cats = detailCats(s);
  const [open, setOpen] = useState<{ side: Side; kind: 'inplay' | 'reception' | 'dig'; q?: ReceptionGrade } | null>(null);
  // describe-court-team DC14: Done / Skip per point (its event id), kept here so a re-render keeps them
  const marks = useDescribeMarks<number>();
  // the last entry's confirmation, until the next point is scored
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const info = (sd: Side) => (sd === 'home' ? home : away);
  const TOAST: Record<VbDetailKind, string> = { inplay: 'Attack in play', reception: 'Reception', blocked: 'Blocked', dig: 'Dig', assist: 'Set by', aced: 'Aced' };
  const send = (kind: VbDetailKind, side: Side, p: Player, q?: ReceptionGrade, pt?: { set: number; at: number }) => {
    // IDs-only scoring: the player by id (match state is public)
    dispatch(detailAction(kind, side, p, q, pt));
    setOpen(null);
    if (pt) return; // the Last point card shows its own "✓ …" line
    const sign = q ? ` ${RECEPTION_GRADES.find((g) => g.key === q)?.sign ?? ''}` : '';
    setToast({ text: `✓ ${TOAST[kind]}${sign} · ${p.fullName}`, n: s.events.length });
  };

  const toggle = (
    <View style={st.toggleRow}>
      <Text style={st.meta}>🔎 Detailed stats{on ? `: ${cats.map((c) => CAT_LABEL[c]).join(' · ')}` : ' (optional)'}</Text>
      <SelectChip label={on ? 'On' : 'Off'} active={on} onPress={() => { dispatch({ type: 'SET_DETAIL', payload: { detail: !on } }); setOpen(null); setToast(null); }} />
    </View>
  );
  if (!on || s.ended) {
    return (
      <View style={st.box}>
        {toggle}
        {!on && <Text style={st.meta}>Choose what to track in ⚙️ Stats to track (attack attempts, reception, digs, set assists, who was aced).</Text>}
      </View>
    );
  }

  const opp = (sd: Side): Side => (sd === 'home' ? 'away' : 'home');
  const has = (c: VbDetailCat) => cats.includes(c);

  /** The "Last point" card: who set the last Attack point, who was blocked by
   *  the last Block, who was aced by the last Ace (each as its category allows). */
  const lastPointCard = (() => {
    const pt = lastScored(s);
    if (!pt) return null;
    const ask: { kind: VbDetailKind; title: string; said: string; who: Side } | null =
      pt.e.kind === 'attack' && has('assist') ? { kind: 'assist', title: '🤝 Set by?', said: 'Set by', who: pt.side }
      : pt.e.kind === 'block' && has('attack') ? { kind: 'blocked', title: '🧱 Who was blocked?', said: 'Blocked', who: opp(pt.side) }
      // batch 5: its own category too (on for new matches), or within Reception
      : pt.e.kind === 'ace' && (has('aced') || has('reception')) ? { kind: 'aced', title: '📥 Who was aced?', said: 'Aced', who: opp(pt.side) }
      : null;
    if (!ask) return null;
    const x = info(ask.who);
    if (!x.court.length) return null;
    const named = entryFor(s, ask.kind, pt);
    // the setter: whoever set last for this side goes first (one tap)
    const lastSetter = ask.kind === 'assist' ? [...(s.vd ?? [])].reverse().find((v) => v.kind === 'assist' && v.side === x.side)?.playerId : undefined;
    const players = lastSetter ? [...x.court].sort((a, b) => (a.id === lastSetter ? -1 : b.id === lastSetter ? 1 : 0)) : x.court;
    const isNamed = (p: Player) => named?.playerId === p.id || (!named?.playerId && named?.playerName === p.fullName);
    const namedP = named ? x.court.find(isNamed) : undefined;
    const summary = named ? `${ask.said} ${namedP?.fullName ?? named.playerName ?? 'player'}` : '';
    return (
      <DescribeCard title={`Last point · ${info(pt.side).name}`} summary={summary} mode={marks.modeOf(pt.e.id)}
        onDone={() => marks.mark(pt.e.id, 'done')} onSkip={() => marks.mark(pt.e.id, 'skipped')} onEdit={() => marks.mark(pt.e.id, null)}>
        <Text style={st.meta}>{ask.title} (optional)</Text>
        <View style={st.chips}>
          {players.map((p) => (
            <SelectChip key={p.id} label={p.fullName} dotColor={x.color} active={isNamed(p)} accessibilityLabel={`${ask.said} ${p.fullName}`}
              onPress={() => send(ask.kind, x.side, p, undefined, { set: pt.set, at: pt.at })} />
          ))}
        </View>
      </DescribeCard>
    );
  })();

  return (
    <View style={st.box} accessibilityLabel="Detailed stats">
      {toggle}
      {has('attack') && <Text style={st.meta}>Kills come from ⚡ Attack points; attack errors from 🚩 Opp. fault › Attack out with the attacker named.</Text>}
      {lastPointCard}
      <View style={st.chips}>
        {[home, away].map((x) => (
          <React.Fragment key={x.side}>
            {has('attack') && <SelectChip label={`⚡ Attack in play · ${x.name}`} dotColor={x.color} active={open?.side === x.side && open.kind === 'inplay'}
              onPress={() => setOpen(open?.side === x.side && open.kind === 'inplay' ? null : { side: x.side, kind: 'inplay' })} />}
            {has('reception') && <SelectChip label={`📥 Reception · ${x.name}`} dotColor={x.color} active={open?.side === x.side && open.kind === 'reception'}
              onPress={() => setOpen(open?.side === x.side && open.kind === 'reception' ? null : { side: x.side, kind: 'reception' })} />}
            {has('dig') && <SelectChip label={`🛡️ Dig · ${x.name}`} dotColor={x.color} active={open?.side === x.side && open.kind === 'dig'}
              onPress={() => setOpen(open?.side === x.side && open.kind === 'dig' ? null : { side: x.side, kind: 'dig' })} />}
          </React.Fragment>
        ))}
      </View>
      {open && open.kind === 'reception' && (
        <View style={st.chips}>
          <Text style={[st.meta, { alignSelf: 'center' }]}>Grade:</Text>
          {RECEPTION_GRADES.map((g) => (
            <SelectChip key={g.key} label={`${g.sign} ${g.label}`} active={open.q === g.key} onPress={() => setOpen({ ...open, q: g.key })} />
          ))}
        </View>
      )}
      {open && (open.kind !== 'reception' || open.q) && (
        <View style={{ gap: theme.spacing(1) }}>
          <Text style={st.meta}>{open.kind === 'inplay' ? 'Attacker (the rally goes on — no point):' : open.kind === 'dig' ? 'Dug by (the rally goes on — no point):' : 'Received by:'}</Text>
          <View style={st.chips}>
            {info(open.side).court.length === 0
              ? <Text style={st.meta}>Add the squad to name players.</Text>
              : info(open.side).court.map((p) => (
                <SelectChip key={p.id} label={p.fullName} dotColor={info(open.side).color} active={false}
                  onPress={() => send(open.kind, open.side, p, open.q)} />
              ))}
          </View>
        </View>
      )}
      {toast && toast.n === s.events.length && <Text style={st.meta} accessibilityLiveRegion="polite">{toast.text}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2), backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.radius.md, padding: theme.spacing(3) },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  label: { flex: 1, color: theme.colors.text, fontSize: theme.font.body, fontWeight: '700' },
  meta: { color: theme.colors.textMuted, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700', paddingHorizontal: theme.spacing(1) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
});
