/**
 * Deep wave — netball's live commentary (Champion Data / Super Netball style),
 * DERIVED from the event log. PURE.
 *
 * Grouped by quarter (Q1 … / ET1 ET2 / play-on), newest first. Each row: the
 * time into the period, the running score after it, and a sentence from what
 * was captured — "Asha Rao (GS) scores — fed by Meera (WA) · from a gain",
 * "Kavya (GA) misses — defensive rebound Priya (GK, Kites)", "Contact penalty
 * against Riya (GD)", "Centre pass Sharks — received by Meera (WA)". A
 * rebound linked to a miss reads on the miss's row. Lead changes and level
 * scores are tagged.
 */
import type { FeedGroup, FeedRow } from '../feedModel.ts';
import { leadTracker } from '../feedModel.ts';
import { clockText, goalPoints, periodName, secInPeriod, TURNOVER_LABEL, type NetballEvent, type NetballState, type Side } from './engine.ts';
import { centreSplit, nbGameOrder, posAt, reboundKind } from './deep.ts';

const STOP_WORD = { injury: 'injury / illness', blood: 'blood', tactical: 'a tactical change', other: 'a stoppage' } as const;

/** The netball play-by-play: period groups, newest first. */
export function netballFeed(s: NetballState, names: { home: string; away: string }): FeedGroup[] {
  const order = nbGameOrder(s);
  const split = centreSplit(s);
  const lead = leadTracker(names);
  // a rebound linked to a listed miss reads on the miss's row
  const answers = new Map<string, NetballEvent>();
  for (const e of s.events) if (e.type === 'stat' && e.stat === 'rebound' && e.ref && s.events.some((m) => m.id === e.ref && m.type === 'miss')) answers.set(e.ref, e);
  const answered = new Set([...answers.values()].map((e) => e.id));
  const groups = new Map<number, FeedGroup>();
  let h = 0, a = 0;
  for (const { e, i } of order) {
    if (answered.has(e.id)) continue;
    const team = e.side ? names[e.side] : '';
    const pos = (side: Side | undefined, id?: string, name?: string): string => {
      if (!side || (!id && !name)) return '';
      const p = posAt(s, side, { id, name }, i);
      return p ? ` (${p})` : '';
    };
    const who = e.playerName ? `${e.playerName}${e.type === 'goal' || e.type === 'miss' ? (e.pos ? ` (${e.pos})` : '') : pos(e.side, e.playerId, e.playerName)}` : (e.pos ? `${team} ${e.pos}` : team);
    const feeder = e.secondName ? `${e.secondName}${pos(e.side, e.secondId, e.secondName)}` : '';
    let icon = '•';
    let text = '';
    let scoring = false;
    switch (e.type) {
      case 'goal': {
        const pts = goalPoints(e);
        if (e.side === 'home') h += pts; else a += pts;
        scoring = true;
        icon = pts === 2 ? '⭐' : '🥅';
        const from = split.goalFrom.get(e.id) === 'gain' ? ' · from a gain' : '';
        text = `${who} ${pts === 2 ? 'scores a super shot (2 points)' : 'scores'}${feeder ? ` — fed by ${feeder}` : ''}${from}`;
        break;
      }
      case 'miss': {
        icon = '↗';
        const r = answers.get(e.id);
        const k = r ? reboundKind(s, r) : undefined;
        const reb = r ? ` — ${k === 'off' ? 'offensive' : k === 'def' ? 'defensive' : ''}${k ? ' ' : ''}rebound ${r.playerName ?? (r.side ? names[r.side] : '')}${r.playerName ? pos(r.side, r.playerId, r.playerName) : ''}${r.side && r.side !== e.side ? `, ${names[r.side]}` : ''}` : '';
        text = `${who} misses${e.ss ? ' a super shot' : ''}${feeder ? ` (fed by ${feeder})` : ''}${reb}`;
        break;
      }
      case 'cpr':
        icon = '⚪';
        text = `Centre pass ${team} — received by ${e.playerName ?? '?'}${e.pos ? ` (${e.pos})` : pos(e.side, e.playerId, e.playerName)}`;
        break;
      case 'stat': {
        const name = e.playerName ? who : team;
        if (e.stat === 'intercept') { icon = '🖐'; text = `Intercept — ${name}`; }
        else if (e.stat === 'deflection') { icon = '☝️'; text = `Deflection — ${name}${e.gain === true ? ', gain' : e.gain === false ? ', no gain' : ''}`; }
        else if (e.stat === 'pickup') { icon = '🤲'; text = `Pick-up — ${name}`; }
        else if (e.stat === 'turnover') { icon = '⚠️'; text = `Turnover — ${name}${e.tt ? ` (${TURNOVER_LABEL[e.tt].toLowerCase()})` : ''}`; }
        else { icon = '⤴️'; text = `Rebound — ${name}`; }
        break;
      }
      case 'penalty':
        icon = '✋';
        text = `${e.penalty === 'contact' ? 'Contact penalty' : e.penalty === 'obstruction' ? 'Obstruction penalty' : 'Penalty'} against ${e.playerName ? who : team}`;
        break;
      case 'sanction': {
        const target = e.official ? `${e.official} (official, ${team})` : e.playerName ? who : team;
        icon = e.sanction === 'warning' ? '🟨' : e.sanction === 'off' ? '🟥' : '⏱';
        text = e.sanction === 'warning' ? `Warning — ${target}` : e.sanction === 'off' ? `${target} ordered off — ${team} play a player short`
          : `${target} suspended for ${e.minutes ?? s.suspensionMinutes} minutes${e.official ? '' : ` — ${team} play a player short`}`;
        break;
      }
      case 'timeout': icon = '⏸'; text = `Team time-out — ${team}`; break;
      case 'stop': icon = '⏸'; text = `Time held for ${STOP_WORD[e.reason ?? 'other']}${e.playerName ? ` (${e.playerName})` : ''}`; break;
      case 'sub':
        icon = '🔁';
        text = e.playerId || e.playerName ? `${e.secondName ?? '?'} comes on for ${e.playerName ?? '?'}${e.pos ? ` at ${e.pos}` : ''}` : `${e.secondName ?? '?'} comes on${e.pos ? ` at ${e.pos}` : ''}`;
        break;
      case 'pos': icon = '⇄'; text = `${e.playerName ?? '?'} moves to ${e.pos}`; break;
      case 'centre': icon = '⚪'; text = `Centre pass order set — ${team} to take it`; break;
    }
    const row: FeedRow = {
      id: e.id,
      clock: clockText(secInPeriod(s, e)),
      ...(e.side ? { side: e.side } : {}),
      icon, text,
      score: { home: h, away: a },
      ...(scoring ? { scoring: true } : {}),
      ...(e.type === 'sub' ? (e.secondName ? { playerName: e.secondName, ...(e.secondId ? { playerId: e.secondId } : {}) } : {})
        : e.playerName && !e.official ? { playerName: e.playerName, ...(e.playerId ? { playerId: e.playerId } : {}) } : {}),
    };
    const note = scoring ? lead(h, a) : e.type === 'sanction' && e.sanction === 'off' ? 'Ordered off' : undefined;
    if (note) row.tag = note;
    const g = groups.get(e.period) ?? groups.set(e.period, { key: String(e.period), title: periodName(s, e.period), score: { home: 0, away: 0 }, rows: [] }).get(e.period)!;
    g.rows.push(row);
    g.score = { home: h, away: a };
  }
  // the toss opens the first period
  if (s.firstCentre) {
    const g = groups.get(1) ?? groups.set(1, { key: '1', title: periodName(s, 1), score: { home: 0, away: 0 }, rows: [] }).get(1)!;
    g.rows.unshift({ id: 'toss', clock: '—', side: s.firstCentre, icon: '🪙', text: `${names[s.firstCentre]} take the first centre pass`, score: { home: 0, away: 0 } });
  }
  return [...groups.entries()].sort((x, y) => y[0] - x[0]).map(([p, g]) => ({
    ...g, rows: [...g.rows].reverse(), ...(!s.ended && p === s.period ? { live: true } : {}),
  }));
}
