/**
 * Timed races round 2 — follower alerts for HEAT WINS and PERSONAL BESTS
 * (athletics, swimming, rowing, canoe sprint, cycling). Until now only a locked
 * final (and the records it set) pushed.
 *
 * Pure (no Deno / Node APIs, no imports) so the notify-followers edge function
 * and the app's tests share one copy of the rules and the wording:
 *   - parseHighlights: what the app leaves on a closed round / locked final
 *                      (field_events.format.highlights) — validated, marks and
 *                      names sanitised; the function re-checks every id against
 *                      the event's entries and takes names from the database.
 *   - highlightTargets: which athletes (player ids) each item is about — the
 *                      athlete, or a relay's / crew's members.
 *   - itemsFor:        what ONE follower hears, from the athletes they follow
 *                      and their alert choices: a heat won needs "Result", a
 *                      PB needs "big moments" (follows.prefs.scores).
 *   - highlightText:   one push per follower: "🏁 Asha Rao won Heat 2 —
 *                      U14 Girls 100 m" / "📈 PB for Asha Rao — …" / several
 *                      athletes in one message.
 *
 * Same shape as src/data/results/raceHighlights.ts (ResultHighlights).
 */

export interface Highlight {
  kind: 'heat' | 'pb';
  playerId?: string;
  teamId?: string;
  memberIds?: string[];
  name: string;
  mark?: string;
  heat?: string;
  pb?: boolean;
}

export interface ResultHighlights { v: 1; event?: string; items: Highlight[] }

const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{8,64}$/i.test(s);

/** Short plain text (a mark or a heat name): digits, letters, units, commas. */
const cleanText = (s: unknown, max: number): string | undefined => {
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  return t && t.length <= max && /^[0-9A-Za-z:.,+\-−() ]+$/.test(t) ? t : undefined;
};

const cleanName = (s: unknown): string | undefined => {
  if (typeof s !== 'string') return undefined;
  const t = s.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 60) : undefined;
};

/** The stored highlights, validated (at most 60 items — a meet's round). Null when absent / unusable. */
export function parseHighlights(raw: unknown): ResultHighlights | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.items)) return null;
  const items: Highlight[] = [];
  for (const x of r.items.slice(0, 60)) {
    if (!x || typeof x !== 'object') continue;
    const h = x as Record<string, unknown>;
    if (h.kind !== 'heat' && h.kind !== 'pb') continue;
    const members = Array.isArray(h.memberIds) ? [...new Set(h.memberIds.filter(isId))].slice(0, 12) : [];
    const playerId = isId(h.playerId) ? h.playerId : undefined;
    if (!playerId && !members.length) continue;
    const name = cleanName(h.name) ?? '';
    items.push({
      kind: h.kind, name,
      ...(playerId ? { playerId } : { memberIds: members, ...(isId(h.teamId) ? { teamId: h.teamId } : {}) }),
      ...(cleanText(h.mark, 24) ? { mark: cleanText(h.mark, 24) } : {}),
      ...(cleanText(h.heat, 32) ? { heat: cleanText(h.heat, 32) } : {}),
      ...(h.kind === 'heat' && h.pb === true ? { pb: true } : {}),
    });
  }
  const event = cleanName(r.event);
  return items.length ? { v: 1, ...(event ? { event } : {}), items } : null;
}

/** The athletes an item is about (their followers hear it). */
export const highlightTargets = (h: Pick<Highlight, 'playerId' | 'memberIds'>): string[] => (h.playerId ? [h.playerId] : [...(h.memberIds ?? [])]);

/** A follow's alert choices (follows.prefs) — missing = on. */
export type Prefs = Partial<Record<'result' | 'scores', boolean>> | null | undefined;

/**
 * What one follower hears: the items about athletes they follow, each cut to
 * what their choices allow (a heat winner's PB still reaches a follower who
 * only wants big moments, as a PB). `follows` = athlete id → that follow's prefs.
 */
export function itemsFor(items: Highlight[], follows: Map<string, Prefs>): Highlight[] {
  const out: Highlight[] = [];
  for (const h of items) {
    const prefs = highlightTargets(h).filter((id) => follows.has(id)).map((id) => follows.get(id));
    if (!prefs.length) continue;
    const result = prefs.some((p) => p?.result !== false);
    const scores = prefs.some((p) => p?.scores !== false);
    if (h.kind === 'heat' && result) out.push(scores || !h.pb ? h : { ...h, pb: undefined });
    else if ((h.kind === 'pb' || h.pb) && scores) out.push({ ...h, kind: 'pb', pb: undefined });
  }
  return out;
}

const joinNames = (names: string[]) =>
  names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** "Asha Rao won Heat 2 in 13.42 (PB)" / "Asha Rao: PB 13.42 (Heat 3)". */
export function highlightPhrase(h: Highlight): string {
  if (h.kind === 'heat') return `${h.name} won ${h.heat ?? 'the heat'}${h.mark ? ` in ${h.mark}` : ''}${h.pb ? ' (PB)' : ''}`;
  return `${h.name}: PB ${h.mark ?? ''}${h.heat ? ` (${h.heat})` : ''}`.replace(/ +/g, ' ').trim();
}

/** One follower's push (null when nothing is for them). */
export function highlightText(items: Highlight[], event: string, tournament?: string | null): { title: string; body: string } | null {
  if (!items.length) return null;
  const tail = tournament ? [tournament] : [];
  if (items.length === 1) {
    const h = items[0];
    if (h.kind === 'heat') {
      return { title: `🏁 ${h.name} won ${h.heat ?? 'their heat'} — ${event}`, body: [h.mark ?? '', h.pb ? 'PB' : '', ...tail].filter(Boolean).join(' · ') || 'Heat result' };
    }
    return { title: `📈 PB for ${h.name} — ${event}`, body: [`${h.mark ?? ''}${h.heat ? ` (${h.heat})` : ''}`.trim(), ...tail].filter(Boolean).join(' · ') || 'Personal best' };
  }
  const icon = items.some((h) => h.kind === 'heat') ? '🏁' : '📈';
  const names = [...new Set(items.map((h) => h.name))];
  return { title: `${icon} ${event} — ${joinNames(names)}`, body: [...items.map(highlightPhrase), ...tail].join(' · ') };
}
