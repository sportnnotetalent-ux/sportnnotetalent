/**
 * Deep wave (volleyball-kabaddi) — kabaddi's raid-by-raid commentary, the PKL
 * match-centre way: grouped by half (then extra time, Golden Raid, the 5-raid
 * shootout), newest first; each raid one sentence with the running score
 * after it — "Raid 23 — Pardeep Narwal (Patna): 2 touch points + bonus", 18-14
 * — the match minute, the players left on the mat, and tags (DO-OR-DIE, SUPER
 * RAID, SUPER TACKLE, ALL OUT, SUPER 10, HIGH 5). PURE.
 *
 * Derived from the state only — the raid list and its replay (rules.ts), the
 * technical points / cards and the plain timeline lines — so a raid edited or
 * removed re-derives the whole feed. Older logs read as they were scored
 * (no skill / touched names, never invented ones).
 */
import type { KabaddiState, KabaddiEvent, RaidEntry, ExtraEntry } from './engine.ts';
import { extrasOf, isShootoutEvent, perRaidByIndex, replayOf, raidSkillLabel, tackleTypeLabel, techReasonLabel, halfLabel } from './engine.ts';
import { YELLOW_MINUTES, type RaidBreakdown } from './rules.ts';
import { joinNames, plural, type FeedEntry, type FeedGroup, type Side } from '../netraid/feed.ts';

const other = (s: Side): Side => (s === 'home' ? 'away' : 'home');
const SCORING = new Set(['raid', 'tackle', 'allout', 'tech', 'lineout']);

export interface KbNames { home: string; away: string }

/** The sentence + tags for one guided raid (pure, unit-tested). */
export function raidSentence(r: RaidEntry, b: RaidBreakdown, n: number, names: KbNames): { text: string; tags: string[] } {
  const T = names[r.side];
  const O = names[other(r.side)];
  const who = r.raider ? `${r.raider} (${T})` : `${T} raider`;
  const tags: string[] = [];
  if (r.gr) tags.push('GOLDEN RAID');
  if (b.doOrDie) tags.push('DO-OR-DIE');
  const parts: string[] = [];
  if (b.lineOut) parts.push(`stepped out of bounds — out, +1 to ${O}`);
  else if (b.doOrDieFail) parts.push(`do-or-die raid failed — out, +1 to ${O}`);
  else {
    if (b.raidPts > 0) {
      const pts = b.touchPts > 0 ? `${plural(b.touchPts, 'touch point')}${b.bonusPts ? ' + bonus' : ''}` : 'bonus point';
      const sk = r.sk ? ` (${(raidSkillLabel(r.sk) ?? r.sk).toLowerCase()})` : '';
      parts.push(`${pts}${sk}`);
    } else if (!b.raiderOut) {
      parts.push(r.bonus && !b.bonusPts ? 'empty raid — bonus void (under 6 defenders)' : r.sk === 'escape' ? 'empty raid — escaped the tackle' : 'empty raid');
    }
    if (b.touchesLost) parts.push(`${plural(b.touchesLost, 'touch', 'touches')} void (caught)`);
    if (b.defOutPts) parts.push(`${plural(b.defOutPts, 'defender')} stepped out (+${b.defOutPts})`);
    if (b.raiderOut) {
      const how = r.tt ? ` with ${(tackleTypeLabel(r.tt) ?? r.tt).toLowerCase()}` : '';
      const by = r.tackler ? `${r.tackler} (${O})` : O;
      parts.push(b.superTackle ? `SUPER TACKLE by ${by}${how} (+2)` : `tackled by ${by}${how}`);
      if (b.superTackle) tags.push('SUPER TACKLE');
    }
  }
  if (b.raidPts >= 3) tags.push('SUPER RAID');
  for (const side of b.allOuts) { parts.push(`ALL OUT — +2 to ${names[side]}`); tags.push('ALL OUT'); }
  return { text: `Raid ${n} — ${who}: ${parts.join('; ')}`, tags };
}

/** "Yellow card — Rahul (Bulls): 2-minute suspension" etc. */
function extraSentence(x: ExtraEntry, pts: number, names: KbNames): string {
  const T = names[x.side];
  const O = names[other(x.side)];
  if (x.x === 'tech') {
    const r = x.reason ? ` — ${(techReasonLabel(x.reason) ?? x.reason).toLowerCase()}` : '';
    return `Technical point to ${T} (+${pts})${r}${x.playerName ? `; ${x.playerName} (${O}) at fault` : ''}`;
  }
  const who = x.official ? `${T} team official` : x.playerName ? `${x.playerName} (${T})` : `a ${T} player`;
  const c = x.card ?? 'green';
  const what = c === 'green' ? 'warning' : c === 'yellow' ? `${YELLOW_MINUTES}-minute suspension` : 'sent off for the match';
  return `${c[0].toUpperCase()}${c.slice(1)} card — ${who}: ${what}${pts ? `; technical point to ${O}` : ''}`;
}

/** The commentary, newest group first; inside a group, newest moment first. */
export function kabaddiCommentary(s: KabaddiState, names: KbNames): FeedGroup[] {
  if (!s || !Array.isArray(s.events)) return [];
  const raids = s.raids ?? [];
  const per = perRaidByIndex(replayOf(s));
  const raidAt = new Map<number, number>();
  raids.forEach((r, i) => { if (r.eid != null) raidAt.set(r.eid, i); });
  const extras = new Map(extrasOf(s).map((x) => [x.eid, x]));
  // the timeline in order, a guided raid / extra and its child lines as one moment
  const moments: { key: number; lines: KabaddiEvent[] }[] = [];
  const byKey = new Map<number, { key: number; lines: KabaddiEvent[] }>();
  for (const e of [...s.events].sort((a, b) => a.id - b.id)) {
    const k = e.group ?? e.id;
    let m = byKey.get(k);
    if (!m || e.group == null) { m = { key: k, lines: [] }; moments.push(m); if (e.group != null) byKey.set(k, m); }
    m.lines.push(e);
  }
  const score = { home: 0, away: 0 };
  const so = { home: 0, away: 0 };
  const raidPts = new Map<string, number>();
  const tklPts = new Map<string, number>();
  const groups = new Map<string, { title: string; order: number; entries: FeedEntry[]; pts: { home: number; away: number } }>();
  const groupOf = (id: string, title: string, order: number) => groups.get(id) ?? groups.set(id, { title, order, entries: [], pts: { home: 0, away: 0 } }).get(id)!;
  let raidNo = 0;
  for (const m of moments) {
    const head = m.lines[0];
    const half = head.half ?? 1;
    const shoot = isShootoutEvent(head);
    const ri = raidAt.get(m.key);
    const raid = ri != null && head.group != null ? raids[ri] : undefined;
    const gr = raid?.gr || head.stamp === 'GR';
    const g = shoot ? groupOf('so', '5-raid shootout', 100) : gr ? groupOf('gr', 'Golden Raid', 90) : groupOf(`h${half}`, halfLabel(half), half);
    // the points this moment scored, per side
    for (const e of m.lines) {
      if (!e.side || !e.points) continue;
      if (shoot) so[e.side] += e.points;
      else if (SCORING.has(e.kind ?? '')) { score[e.side] += e.points; g.pts[e.side] += e.points; }
    }
    const sc = shoot ? `${so.home}-${so.away}` : `${score.home}-${score.away}`;
    const stamp = shoot ? 'SO' : gr ? 'GR' : head.stamp;
    if (raid && ri != null) {
      const b = per[ri];
      if (!b || raid.hidden) continue;
      raidNo += 1;
      const { text, tags } = raidSentence(raid, b, raidNo, names);
      // milestones: a raider's 10th raid point / a defender's 5th tackle point
      const rk = `${raid.side}|${raid.raiderId ?? raid.raider ?? ''}`;
      if (raid.raider && b.raidPts) {
        const before = raidPts.get(rk) ?? 0;
        raidPts.set(rk, before + b.raidPts);
        if (before < 10 && before + b.raidPts >= 10) tags.push(`SUPER 10 — ${raid.raider.toUpperCase()}`);
      }
      if (raid.tackler && b.raiderOut && !b.doOrDieFail && !b.lineOut && b.tacklePts) {
        const tk = `${other(raid.side)}|${raid.tacklerId ?? raid.tackler}`;
        const before = tklPts.get(tk) ?? 0;
        tklPts.set(tk, before + b.tacklePts);
        if (before < 5 && before + b.tacklePts >= 5) tags.push(`HIGH 5 — ${raid.tackler.toUpperCase()}`);
      }
      const touched = (raid.touched ?? []).slice(0, b.touchPts).map((p) => p.name);
      const mat = b.matAfter && s.style !== 'amar' ? `On the mat: ${names.home} ${b.matAfter.home} · ${names.away} ${b.matAfter.away}` : null;
      const chance = b.stChance && !b.superTackle && !b.doOrDieFail ? `Super tackle on (${plural(b.defBefore ?? 0, 'defender')})` : null;
      const detail = [touched.length ? `Touched: ${joinNames(touched)}` : null, chance, mat].filter(Boolean).join(' · ');
      g.entries.push({
        id: `r${raid.eid}`, stamp, icon: b.allOuts.length ? '💥' : b.superTackle ? '🛡️' : raid.gr ? '⚡' : '🤼', side: raid.side, score: sc, text,
        ...(detail ? { detail } : {}), ...(tags.length ? { tags } : {}), ...(tags.length ? { key: true } : {}),
      });
      continue;
    }
    const x = head.group != null ? extras.get(m.key) : undefined;
    if (x) {
      const pts = m.lines.reduce((t, e) => t + (e.kind === 'tech' ? e.points ?? 0 : 0), 0);
      g.entries.push({ id: `x${x.eid}`, stamp, icon: head.icon, side: x.side, score: sc, text: extraSentence(x, pts, names), ...(x.x === 'card' && x.card !== 'green' ? { key: true, tags: [`${x.card!.toUpperCase()} CARD`] } : {}) });
      continue;
    }
    if (!head.side) continue;
    const T = names[head.side];
    if (shoot) {
      g.entries.push({ id: `so${head.id}`, stamp, icon: '🎯', side: head.side, score: sc, key: true, text: `Shootout raid — ${head.playerName ? `${head.playerName} (${T})` : T}: ${head.points ? `+${head.points}` : 'no point'}` });
    } else if (head.kind === 'timeout') {
      g.entries.push({ id: `t${head.id}`, stamp, icon: '⏱️', side: head.side, score: sc, text: `Timeout ${T}` });
    } else if (head.kind === 'sub') {
      const mm = /^(.*?)\s*⬆\s+(.*?)\s*⬇$/.exec(head.detail ?? '');
      g.entries.push({ id: `s${head.id}`, stamp, icon: '🔄', side: head.side, score: sc, text: mm ? `Substitution ${T}: ${mm[1]} in for ${mm[2]}${head.ret ? ' (returns)' : ''}` : `Substitution ${T}` });
    } else if (head.kind === 'raid' || head.kind === 'tackle') {
      // an old one-tap point, or a legacy line kept on the timeline
      const what = head.kind === 'raid' ? 'Raid point' : 'Tackle point';
      g.entries.push({ id: `l${head.id}`, stamp, icon: head.icon, side: head.side, score: sc, text: `${what}${head.points && head.points > 1 ? `s (+${head.points})` : ''} ${T}${head.playerName ? ` — ${head.playerName}` : ''}` });
    }
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].order - a[1].order)
    .map(([id, g]) => ({
      id, title: g.title,
      sub: id === 'so' ? `${names.home} ${so.home}-${so.away} ${names.away}` : `${names.home} ${g.pts.home}-${g.pts.away} ${names.away} in the ${id === 'gr' ? 'Golden Raid' : id.startsWith('h') && Number(id.slice(1)) > 2 ? 'period' : 'half'}`,
      entries: [...g.entries].reverse(),
    }));
}
