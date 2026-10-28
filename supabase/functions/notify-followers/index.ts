/**
 * Edge Function: notify-followers
 * ------------------------------------------------------------------------
 * Production push path. The in-app feed + local notification work client-side
 * today; for REMOTE delivery (alerting a parent whose app is closed) a server
 * must call Expo's Push API. This function does that.
 *
 * Wire it up with a Database Webhook (Dashboard → Database → Webhooks):
 *   table: stat_lines · events: INSERT, UPDATE · type: Supabase Edge Function
 *
 * On each stat-line change it:
 *   0. diffs the new row against `old_record` and stops unless a HEADLINE stat
 *      (goals, runs, wickets, points…) went UP — so a post-match correction or a
 *      completion sync (rows rewritten, values lowered or unchanged) pushes nothing,
 *   1. loads the player + what went up,
 *   2. finds everyone following that player,
 *   3. collects their push tokens,
 *   4. sends a batch to https://exp.host/--/api/v2/push/send.
 *
 * Only the database webhook may call this (migration 0025): it must send the
 * header `x-webhook-secret: <WEBHOOK_SECRET>` (add it under the webhook's HTTP
 * Headers). Without the secret configured the function refuses every call, so a
 * stranger can't push fake "stat" alerts to a player's followers.
 *
 * MATCH STATUS (CricHeroes parity #23) — the same function is also called by the
 * `match_status_notify` DB trigger (migration 20261019122300_follow_prefs.sql),
 * NOT by a `matches` UPDATE webhook (that would fire on every scored ball, since
 * each ball rewrites matches.state). The trigger fires only when `status` actually
 * changes and posts `{ type: 'match_status', record, old_record: { status } }`
 * with the same `x-webhook-secret` header. Transitions:
 *   → live (from anything but completed) = 'start'   "🔴 RED vs BLU is live"
 *   → completed                          = 'result'  "Full time — RED vs BLU"
 * Recipients: followers of both teams, of the tournament, and of the players in
 * the match (match_squads, falling back to team_members) — filtered by each
 * follow's alert choices (follows.prefs), de-duplicated per profile, and recorded
 * in `reminder_sends` (lead_key = 'start' | 'result', kind = 'follower') so a
 * repeated transition never double-sends.
 * Trigger setup (founder, once): store two Vault secrets —
 *   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify-followers', 'notify_followers_url');
 *   select vault.create_secret('<same value as WEBHOOK_SECRET>', 'webhook_secret');
 * and optionally 'functions_anon_key' (the public anon key, for the gateway's JWT
 * check). Until both are set the trigger posts nothing.
 *
 * TEAM TIES (SD-48): a rubber of a team tie (its `format.__tie` is set) does
 * not spam team / tournament followers. 'start' goes to them for rubber 1
 * only; a rubber's 'result' goes to its players' followers only; and when the
 * rubber that DECIDES the tie completes, team + tournament followers get one
 * "🏆 A beat B 3–1" push (ledger: lead_key 'tie_result' on rubber 1's id, so
 * it can never double-send). Before this deploy, every rubber pushed as a match.
 *
 * EVENT RESULTS (SD-131): the `field_event_status_notify` trigger (migration
 * 20261019124310_event_result_alerts.sql) posts `{ type: 'field_status', record:
 * { id, sport, tournament_id, title, round_no, status } }` when a field event
 * turns 'completed'. Only a FINAL (athletics, swimming, weightlifting, shooting,
 * archery, rowing, canoe, cycling — the last planned round / the last event of a
 * combined event) or a GOLF round pushes; a heat closing is skipped. The podium
 * comes from `format.alert` (written by the app as it locks — every id is checked
 * against the event's entries and names are read from players / teams), falling
 * back to the stat lines (golds / won). Records: the tournament's record book rows
 * whose eventKey is this event. "🥇 Asha Rao won U14 Girls 100 m in 13.42 — meet
 * record" goes to followers of the athletes (relay / crew members included), of
 * their teams / houses and of the tournament who want 'result'; ledger:
 * reminder_sends (event_id, lead_key 'final' | 'round', kind 'follower'), so a
 * final reopened and locked again never pushes twice.
 *
 * HEAT WINS AND PBs (timed races round 2): the same 'field_status' call also
 * reads `format.highlights` (written by the app as a round closes or a final
 * locks — athletics, swimming, rowing, canoe, cycling): heats won and personal
 * bests. Followers of those athletes (a relay's / crew's members) get ONE push
 * per event about the athletes they follow — a heat win needs their "Result"
 * switch, a PB their "big moments" (scores) switch; ids are checked against the
 * entries, names read from players / teams. Ledger: reminder_sends (event_id,
 * lead_key 'highlights', kind 'follower'), so a round reopened and closed again
 * never pushes twice. Team / tournament followers keep the one final push.
 *
 * ALERT CHOICES: a follower whose follows.prefs has `scores: false` gets no stat
 * pushes; `start: false` / `result: false` skip the status pushes. Before the
 * migration the prefs column is absent → the select falls back and everyone gets
 * everything.
 *
 * Deploy:  supabase functions deploy notify-followers
 * Secrets: WEBHOOK_SECRET (set it: supabase secrets set WEBHOOK_SECRET=<random>);
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { safeEqual } from '../_shared/guard.ts';
import { webPushToProfiles } from '../_shared/webpush.ts';
import { allowedPlayerFollows, keepAllowedFollows } from '../_shared/minorFollows.ts';
import { alertText, eventName, parseAlert, phaseKind, recordsSetBy, type AlertMedal, type RecordSet } from '../_shared/resultAlert.ts';
import { highlightTargets, highlightText, itemsFor, parseHighlights, type Highlight, type Prefs as HighlightPrefs } from '../_shared/resultHighlights.ts';
// PostgREST stops at 1,000 rows without saying so: page every list, chunk long .in() lists.
import { chunk, fetchAllChunked, fetchAllPages } from '../_shared/paging.ts';

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Stats worth a push when they go up. Everything else (shots, balls faced…) is
// detail for the profile, not an alert.
const HEADLINE = new Set([
  'goals', 'assists', 'runs', 'wickets', 'catches', 'points', 'raidPoints', 'tacklePoints',
  'aces', 'blocks', 'birdies', 'eagles', 'queens', 'fifties', 'hundreds',
]);

type AlertKey = 'reminder' | 'start' | 'result' | 'scores' | 'award';
type Prefs = Partial<Record<AlertKey, boolean>> | null | undefined;
type TargetType = 'player' | 'team' | 'tournament';
interface FollowRow { follower_id: string; target_type?: TargetType; target_id?: string; prefs?: Prefs }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Followers of the given targets, with their alert choices when the column exists. */
async function followersOf(targetType: TargetType, ids: string[]): Promise<FollowRow[]> {
  if (!ids.length) return [];
  // A tournament / team / star player can have thousands of followers: every page.
  const q = (cols: string) => fetchAllChunked(ids, (part, from, to) =>
    supabase.from('follows').select(cols).eq('target_type', targetType).in('target_id', part)
      .order('target_id').order('follower_id').range(from, to));
  const withPrefs = await q('follower_id, target_type, target_id, prefs');
  // Pre-migration: no prefs column → everyone wants everything.
  const rows = ((!withPrefs.error ? withPrefs.data : (await q('follower_id, target_type, target_id')).data) ?? []) as unknown as FollowRow[];
  // protect_minors (L15): an under-18's alerts reach only their circle + guardian.
  if (targetType !== 'player' || !rows.length) return rows;
  return keepAllowedFollows(rows, await allowedPlayerFollows(supabase, ids));
}

const wants = (p: Prefs, key: AlertKey) => p?.[key] !== false;

/** Expo push + web push to every device of these profiles. */
async function sendToProfiles(
  ids: string[],
  title: string,
  body: string,
  data: { url: string } & Record<string, unknown>,
): Promise<{ sent: number; web: number }> {
  const unique = [...new Set(ids)];
  if (!unique.length) return { sent: 0, web: 0 };
  // Web push (iPhone Home Screen app, browsers).
  const web = await webPushToProfiles(unique, { title, body, url: data.url });
  const { data: tokens } = await fetchAllChunked(unique, (part, from, to) =>
    supabase.from('push_tokens').select('token').in('profile_id', part).order('profile_id').order('token').range(from, to));
  if (!tokens?.length) return { sent: 0, web };
  const messages = tokens.map((t) => ({ to: t.token, sound: 'default', title, body, data }));
  // Expo takes at most 100 messages per request (one big request failed whole).
  for (const batch of chunk(messages, 100)) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
  }
  return { sent: messages.length, web };
}

/** Claim ledger rows (ignoreDuplicates): the rows a call gets back are the ones IT
 *  claimed. In batches, so no response can be cut short at the 1,000-row cap.
 *  `ids` null when a batch failed (as a failed single call's data was). */
async function claim(rows: Record<string, unknown>[], onConflict: string): Promise<{ ids: string[] | null; error: { message: string } | null }> {
  const ids: string[] = [];
  for (const part of chunk(rows, 500)) {
    const { data, error } = await supabase.from('reminder_sends').upsert(part, { onConflict, ignoreDuplicates: true }).select('recipient_id');
    if (error) return { ids: null, error };
    for (const r of (data ?? []) as { recipient_id: string }[]) ids.push(r.recipient_id);
  }
  return { ids, error: null };
}

interface MatchRecord {
  id: string;
  status: string;
  sport: string;
  tournament_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  winner: 'home' | 'away' | 'draw' | null;
  result?: { kind?: string } | null;
  format?: Record<string, unknown> | null;
}

/** SD-48 — the tie this rubber belongs to (its format carries the spec). */
function tieOf(record: MatchRecord): { id: string; leg: number; n: number; half: boolean; teamA: string } | null {
  const f = record.format ?? {};
  if (typeof f.__tie !== 'string' || typeof f.__seriesId !== 'string') return null;
  return { id: f.__seriesId, leg: Number(f.__seriesLeg) || 0, n: Number(f.__seriesN) || 0, half: f.__tieHalf === true, teamA: String(f.__seriesA ?? '') };
}

/** SD-48 — the tie's score from its rubbers, and whether it is decided (more
 *  than half the rubbers' points; ½ each for a drawn chess board). */
function tieScore(rubbers: MatchRecord[], tie: NonNullable<ReturnType<typeof tieOf>>) {
  let a = 0, b = 0;
  const n = tie.n || rubbers.length;
  for (const r of rubbers) {
    if (r.status !== 'completed') continue;
    const aHome = r.home_team_id === tie.teamA;
    if (r.winner === 'draw') {
      const noGame = r.result?.kind === 'no_result' || r.result?.kind === 'abandoned';
      if (tie.half && !noGame) { a += 0.5; b += 0.5; }
    } else if (r.winner) { if ((r.winner === 'home') === aHome) a += 1; else b += 1; }
  }
  const need = tie.half ? n / 2 + 0.5 : Math.floor(n / 2) + 1;
  const left = rubbers.filter((r) => r.status === 'scheduled' || r.status === 'live' || r.status === 'postponed').length;
  const decided = a >= need || b >= need || left === 0;
  return { a, b, decided };
}

const pts = (n: number) => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ''}½`);

/** SD-48 — one push to team + tournament followers when a rubber decides its tie. */
async function handleTieResult(record: MatchRecord, tie: NonNullable<ReturnType<typeof tieOf>>): Promise<Record<string, unknown>> {
  const { data } = await supabase.from('matches')
    .select('id, status, sport, tournament_id, home_team_id, away_team_id, winner, result, format')
    .eq('format->>__seriesId', tie.id);
  const rubbers = (data ?? []) as MatchRecord[];
  const now = tieScore(rubbers, tie);
  if (!now.decided) return { tie: 'open' };
  // Decided only now? (this rubber back to unfinished → not decided)
  const before = tieScore(rubbers.map((r) => (r.id === record.id ? { ...r, status: 'live', winner: null } : r)), tie);
  if (before.decided) return { tie: 'already decided' };
  const first = rubbers.find((r) => Number((r.format ?? {}).__seriesLeg) === 1) ?? record;
  const teamIds = [first.home_team_id, first.away_team_id].filter((x): x is string => !!x);
  const [teamF, tourF, { data: teams }] = await Promise.all([
    followersOf('team', teamIds),
    followersOf('tournament', record.tournament_id ? [record.tournament_id] : []),
    supabase.from('teams').select('id, name, short_name').in('id', teamIds),
  ]);
  const recipients = [...new Set([...teamF, ...tourF].filter((f) => wants(f.prefs, 'result')).map((f) => f.follower_id))];
  if (!recipients.length) return { tie: 'no followers' };
  const { ids: claimed } = await claim(recipients.map((recipient_id) => ({ match_id: first.id, lead_key: 'tie_result', recipient_id, kind: 'follower' })),
    'match_id,lead_key,recipient_id,kind');
  const toSend = claimed ?? [];
  if (!toSend.length) return { tie: 'duplicate' };
  const nameOf = (id: string | null) => {
    const t = (teams ?? []).find((x) => x.id === id);
    return (t?.short_name || t?.name || 'Team') as string;
  };
  const A = nameOf(tie.teamA || first.home_team_id);
  const B = nameOf(teamIds.find((x) => x !== (tie.teamA || first.home_team_id)) ?? null);
  const title = now.a === now.b ? `🤝 ${A} and ${B} draw ${pts(now.a)}–${pts(now.b)}`
    : now.a > now.b ? `🏆 ${A} beat ${B} ${pts(now.a)}–${pts(now.b)}` : `🏆 ${B} beat ${A} ${pts(now.b)}–${pts(now.a)}`;
  const out = await sendToProfiles(toSend, title, 'Team tie result', { url: `/m/${record.id}`, matchId: record.id });
  return { tie: 'sent', recipients: toSend.length, ...out };
}

const idsOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter((x): x is string => !!x) : [];

async function handleMatchStatus(record: MatchRecord, oldStatus: string | null | undefined): Promise<Response> {
  if (!record?.id || record.status === oldStatus) return json({ skipped: 'no change' });
  const key: AlertKey | null =
    record.status === 'completed' ? 'result'
    : record.status === 'live' && oldStatus !== 'completed' ? 'start'
    : null;
  if (!key) return json({ skipped: `transition ${oldStatus}→${record.status}` });

  const teamIds = [record.home_team_id, record.away_team_id].filter((x): x is string => !!x);
  const [{ data: teams }, { data: tourney }, { data: squads }] = await Promise.all([
    teamIds.length ? supabase.from('teams').select('id, name, short_name').in('id', teamIds) : Promise.resolve({ data: [] as { id: string; name: string; short_name: string | null }[] }),
    record.tournament_id ? supabase.from('tournaments').select('name').eq('id', record.tournament_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('match_squads').select('side, starters, subs').eq('match_id', record.id),
  ]);
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const short = (id: string | null, fallback: string) => {
    const t = id ? teamById.get(id) : undefined;
    return (t?.short_name || t?.name || fallback) as string;
  };
  const home = short(record.home_team_id, 'Home');
  const away = short(record.away_team_id, 'Away');

  // Players in the match: the match squads, else the team rosters.
  let playerIds = (squads ?? []).flatMap((s) => [...idsOf(s.starters), ...idsOf(s.subs)]);
  if (!playerIds.length && teamIds.length) {
    // the teams' explicit rosters (where the app keeps membership) + team_members
    const [{ data: rosterRows }, { data: members }] = await Promise.all([
      supabase.from('teams').select('roster').in('id', teamIds),
      fetchAllPages((from, to) => supabase.from('team_members').select('player_id').in('team_id', teamIds)
        .order('team_id').order('player_id').range(from, to)),
    ]);
    playerIds = [...new Set([
      ...(rosterRows ?? []).flatMap((t) => idsOf((t as { roster?: unknown }).roster)),
      ...(members ?? []).map((m) => m.player_id as string),
    ])];
  }

  // SD-48: a tie rubber reaches team / tournament followers only as the tie
  // (rubber 1's start, and the one tie result below) — players' followers
  // still hear about their rubber.
  const tie = tieOf(record);
  const tieQuiet = !!tie && !(key === 'start' && tie.leg === 1);
  const tieOut = tie && key === 'result' ? await handleTieResult(record, tie).catch((e) => ({ tie: 'error', message: String(e) })) : undefined;
  const [teamF, tourF, playerF] = await Promise.all([
    tieQuiet ? Promise.resolve([] as FollowRow[]) : followersOf('team', teamIds),
    tieQuiet ? Promise.resolve([] as FollowRow[]) : followersOf('tournament', record.tournament_id ? [record.tournament_id] : []),
    followersOf('player', [...new Set(playerIds)]),
  ]);
  // Filter by each follow's choice, then de-dupe per profile: a profile gets the
  // alert if ANY of its follows touching this match wants it.
  const recipients = [...new Set([...teamF, ...tourF, ...playerF].filter((f) => wants(f.prefs, key)).map((f) => f.follower_id))];
  if (!recipients.length) return json({ key, sent: 0, recipients: 0, ...(tieOut ? { tieOut } : {}) });

  // Ledger: one start + one result per (match, profile), ever.
  const { data: already } = await fetchAllChunked(recipients, (part, from, to) => supabase
    .from('reminder_sends')
    .select('recipient_id')
    .eq('match_id', record.id)
    .eq('lead_key', key)
    .eq('kind', 'follower')
    .in('recipient_id', part)
    .order('recipient_id').range(from, to));
  const done = new Set((already ?? []).map((r) => r.recipient_id as string));
  const fresh = recipients.filter((id) => !done.has(id));
  if (!fresh.length) return json({ key, sent: 0, recipients: 0, duplicate: true });
  // Claim first (ignoreDuplicates) so a concurrent call can't double-send.
  const { ids: claimed } = await claim(fresh.map((recipient_id) => ({ match_id: record.id, lead_key: key, recipient_id, kind: 'follower' })),
    'match_id,lead_key,recipient_id,kind');
  const toSend = claimed ?? fresh;

  const label = `${home} vs ${away}`;
  const sport = record.sport ? record.sport[0].toUpperCase() + record.sport.slice(1) : 'Match';
  let title: string;
  let body: string;
  if (key === 'start') {
    title = `🔴 ${label} is live`;
    body = tourney?.name ? `${sport} · ${tourney.name}` : sport;
  } else {
    title = `Full time — ${label}`;
    body = record.winner === 'home' ? `${home} won`
      : record.winner === 'away' ? `${away} won`
      : record.winner === 'draw' ? 'Match drawn'
      : record.result?.kind ? 'No result' : 'Match ended';
  }
  const out = await sendToProfiles(toSend, title, body, { url: `/m/${record.id}`, matchId: record.id });
  return json({ key, recipients: toSend.length, ...out, ...(tieOut ? { tieOut } : {}) });
}

/* ------------------------- SD-131: event results ------------------------- */

interface FieldStatusRecord { id: string; sport?: string; status?: string }
interface FieldEntryRow { player_id: string | null; team_id?: string | null; result?: Record<string, unknown> | null }

const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function handleFieldStatus(rec: FieldStatusRecord): Promise<Response> {
  if (!isUuid(rec?.id)) return json({ skipped: 'no event' });
  const { data: ev } = await supabase.from('field_events')
    .select('id, sport, tournament_id, title, round_no, status, format').eq('id', rec.id).maybeSingle();
  if (!ev || ev.status !== 'completed') return json({ skipped: 'not completed' });
  const kind = phaseKind(ev.sport as string, ev.format);
  // timed races round 2: a round closing can carry heat wins / PBs (format.highlights)
  const hasHighlights = !!(ev.format as Record<string, unknown> | null)?.highlights;
  if (!kind && !hasHighlights) return json({ skipped: 'not a final' });

  // Who is in it: athletes (relay / crew members too) and the teams / houses they score for.
  // A big field (a cross-country race) passes 1,000 entries: every page.
  const q = (cols: string) => fetchAllPages((from, to) => supabase.from('field_entries').select(cols).eq('event_id', ev.id).order('id').range(from, to));
  let entryRes = await q('player_id, team_id, result');
  if (entryRes.error) entryRes = await q('player_id, result'); // before 0051
  const entries = (entryRes.data ?? []) as unknown as FieldEntryRow[];
  const playerIds = new Set<string>();
  const teamIds = new Set<string>();
  for (const e of entries) {
    if (isUuid(e.player_id)) playerIds.add(e.player_id);
    if (isUuid(e.team_id)) teamIds.add(e.team_id);
    const r = e.result ?? {};
    const team = r.team as { id?: unknown } | undefined;
    if (isUuid(team?.id)) teamIds.add(team!.id as string);
    for (const m of Array.isArray(r.members) ? r.members : []) {
      const pid = (m as { playerId?: unknown })?.playerId;
      if (isUuid(pid)) playerIds.add(pid);
    }
  }

  // Timed races round 2: heat wins and PBs → the athletes' followers (one push each)
  const hl = hasHighlights ? await handleHighlights(ev, playerIds, teamIds).catch((e) => ({ status: 'error', message: String(e) })) : undefined;
  if (!kind) return json({ skipped: 'not a final', highlights: hl });

  // The podium: the app's summary (ids checked against the entries), else the stat lines.
  const stored = parseAlert((ev.format as Record<string, unknown> | null)?.alert);
  let medals: AlertMedal[] = (stored?.medals ?? []).filter((m) =>
    (m.playerId && playerIds.has(m.playerId)) || (m.teamId && teamIds.has(m.teamId)));
  if (!medals.some((m) => m.medal === 'gold')) {
    const { data: lines } = await fetchAllPages((from, to) =>
      supabase.from('stat_lines').select('player_id, stats, won').eq('event_id', ev.id).order('id').range(from, to));
    medals = ((lines ?? []) as { player_id: string; stats?: Record<string, number>; won?: boolean }[])
      .filter((l) => (kind === 'golf' ? l.won === true : Number(l.stats?.golds) > 0) && playerIds.has(l.player_id))
      .map((l) => ({ medal: 'gold' as const, playerId: l.player_id, name: '' }));
    // a relay / crew: its members' lines all carry the gold — name the team once
    const relay = entries.find((e) => !e.player_id && Array.isArray(e.result?.members)
      && medals.length > 0 && medals.every((m) => (e.result!.members as { playerId?: string }[]).some((x) => x.playerId === m.playerId)));
    if (relay) {
      const t = relay.result?.team as { id?: string; name?: string } | undefined;
      medals = [{ medal: 'gold', ...(isUuid(relay.team_id) ? { teamId: relay.team_id } : isUuid(t?.id) ? { teamId: t!.id } : {}), name: typeof t?.name === 'string' ? t.name : '' }];
    }
  }
  if (!medals.some((m) => m.medal === 'gold')) return json({ skipped: 'no winner', highlights: hl });

  // Names from the database (the stored ones are the fallback for a team snapshot).
  const pIds = [...new Set(medals.map((m) => m.playerId).filter((x): x is string => !!x))];
  const tIds = [...new Set(medals.map((m) => m.teamId).filter((x): x is string => !!x))];
  const [{ data: ps }, { data: ts }, { data: tourney }] = await Promise.all([
    pIds.length ? supabase.from('players').select('id, full_name').in('id', pIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    tIds.length ? supabase.from('teams').select('id, name').in('id', tIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ev.tournament_id ? supabase.from('tournaments').select('name, formats').eq('id', ev.tournament_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const pName = new Map((ps ?? []).map((p) => [p.id, p.full_name as string]));
  const tName = new Map((ts ?? []).map((t) => [t.id, t.name as string]));
  const sheetGolds = new Set(medals.filter((m) => m.medal === 'gold' && m.name).map((m) => m.name));
  const named = medals.map((m) => ({
    ...m,
    name: (m.playerId && pName.get(m.playerId)) || (m.teamId && tName.get(m.teamId)) || m.name || (kind === 'golf' ? 'A golfer' : 'An athlete'),
  }));

  // Records this event set (the tournament's book) — a winner's own record rides on the title.
  let records: RecordSet[] = [];
  const t = tourney as { name?: string; formats?: Record<string, { records?: unknown }> } | null;
  if (kind === 'final' && t?.formats) {
    const key = ((ev.format as { results?: { eventKey?: unknown } } | null)?.results)?.eventKey;
    records = recordsSetBy(t.formats[ev.sport as string]?.records, key)
      .map((r) => (r.holder && sheetGolds.has(r.holder) ? { scope: r.scope } : r));
  }

  const text = alertText({
    kind,
    event: stored?.event ?? eventName(String(ev.title ?? ''), ev.format),
    medals: named,
    records,
    tournament: t?.name ?? null,
    inTournament: !!ev.tournament_id,
  });
  if (!text) return json({ skipped: 'no winner', highlights: hl });

  const [playerF, teamF, tourF] = await Promise.all([
    followersOf('player', [...playerIds]),
    followersOf('team', [...teamIds]),
    followersOf('tournament', ev.tournament_id ? [ev.tournament_id as string] : []),
  ]);
  const recipients = [...new Set([...playerF, ...teamF, ...tourF].filter((f) => wants(f.prefs, 'result')).map((f) => f.follower_id))];
  if (!recipients.length) return json({ kind, sent: 0, recipients: 0, highlights: hl });

  // Ledger: one push per (event, profile), ever — claim first so a re-lock or a
  // concurrent call can't double-send.
  const lead = kind === 'golf' ? 'round' : 'final';
  const { ids: claimed, error: claimErr } = await claim(recipients.map((recipient_id) => ({ event_id: ev.id, lead_key: lead, recipient_id, kind: 'follower' })),
    'event_id,lead_key,recipient_id,kind');
  // no event_id column yet → send nothing rather than risk repeats
  if (claimErr) return json({ kind, error: 'ledger', message: claimErr.message, highlights: hl }, 500);
  const toSend = claimed ?? [];
  if (!toSend.length) return json({ kind, sent: 0, recipients: 0, duplicate: true, highlights: hl });

  const url = kind === 'golf' ? `/g/${ev.id}` : `/r/${ev.id}`;
  const out = await sendToProfiles(toSend, text.title, text.body, { url, eventId: ev.id });
  return json({ kind, recipients: toSend.length, ...out, highlights: hl });
}

/**
 * Timed races round 2 — heat wins and personal bests (format.highlights) to the
 * followers of those athletes: one push per follower per event, cut to their
 * alert choices; ids checked against the event's entries; names from the database.
 */
async function handleHighlights(
  ev: { id: string; title?: unknown; format?: unknown; tournament_id?: unknown },
  playerIds: Set<string>,
  teamIds: Set<string>,
): Promise<Record<string, unknown>> {
  const stored = parseHighlights((ev.format as Record<string, unknown> | null)?.highlights);
  if (!stored) return { status: 'none' };
  // only athletes who are in this event (a relay's / crew's members included)
  const items: Highlight[] = stored.items.flatMap((h) => {
    if (h.playerId) return playerIds.has(h.playerId) ? [h] : [];
    const memberIds = (h.memberIds ?? []).filter((id) => playerIds.has(id));
    return memberIds.length ? [{ ...h, memberIds, ...(h.teamId && teamIds.has(h.teamId) ? {} : { teamId: undefined }) }] : [];
  });
  if (!items.length) return { status: 'none' };

  const pIds = [...new Set(items.map((h) => h.playerId).filter((x): x is string => !!x))];
  const tIds = [...new Set(items.map((h) => h.teamId).filter((x): x is string => !!x))];
  const [{ data: ps }, { data: ts }, { data: tourney }] = await Promise.all([
    pIds.length ? supabase.from('players').select('id, full_name').in('id', pIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    tIds.length ? supabase.from('teams').select('id, name').in('id', tIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ev.tournament_id ? supabase.from('tournaments').select('name').eq('id', ev.tournament_id as string).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const pName = new Map((ps ?? []).map((p) => [p.id, p.full_name as string]));
  const tName = new Map((ts ?? []).map((t) => [t.id, t.name as string]));
  const named = items.map((h) => ({ ...h, name: (h.playerId && pName.get(h.playerId)) || (h.teamId && tName.get(h.teamId)) || h.name || 'An athlete' }));

  // each follower → the athletes they follow here, with that follow's choices
  const follows = await followersOf('player', [...new Set(named.flatMap(highlightTargets))]);
  const byFollower = new Map<string, Map<string, HighlightPrefs>>();
  for (const f of follows) {
    if (!f.target_id) continue;
    const m = byFollower.get(f.follower_id) ?? new Map<string, HighlightPrefs>();
    m.set(f.target_id, (f.prefs ?? null) as HighlightPrefs);
    byFollower.set(f.follower_id, m);
  }
  const event = stored.event ?? eventName(String(ev.title ?? ''), ev.format);
  const tour = (tourney as { name?: string } | null)?.name ?? null;
  const plan = [...byFollower].flatMap(([id, m]) => {
    const text = highlightText(itemsFor(named, m), event, tour);
    return text ? [{ id, text }] : [];
  });
  if (!plan.length) return { status: 'no followers' };

  // Ledger: one highlights push per (event, profile), ever — claim first.
  const { data: claimed, error: claimErr } = await supabase
    .from('reminder_sends')
    .upsert(plan.map((p) => ({ event_id: ev.id, lead_key: 'highlights', recipient_id: p.id, kind: 'follower' })),
      { onConflict: 'event_id,lead_key,recipient_id,kind', ignoreDuplicates: true })
    .select('recipient_id');
  if (claimErr) return { status: 'ledger', message: claimErr.message };
  const mine = new Set(((claimed ?? []) as { recipient_id: string }[]).map((r) => r.recipient_id));
  // the same message to many followers goes as one batch
  const groups = new Map<string, { title: string; body: string; ids: string[] }>();
  for (const p of plan) {
    if (!mine.has(p.id)) continue;
    const k = `${p.text.title}\n${p.text.body}`;
    const g = groups.get(k) ?? { ...p.text, ids: [] };
    g.ids.push(p.id);
    groups.set(k, g);
  }
  let sent = 0, web = 0, recipients = 0;
  for (const g of groups.values()) {
    const out = await sendToProfiles(g.ids, g.title, g.body, { url: `/r/${ev.id}`, eventId: ev.id });
    sent += out.sent; web += out.web; recipients += g.ids.length;
  }
  return { status: recipients ? 'sent' : 'duplicate', recipients, sent, web };
}

interface StatLineRecord {
  player_id: string;
  sport: string;
  stats: Record<string, number>;
  opponent: string | null;
  /** stat_lines.match_id — opens the match on tap (web push) */
  match_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'Content-Type': 'application/json' } }); // W4 (EF-16)
  if (!WEBHOOK_SECRET) return new Response('WEBHOOK_SECRET not configured', { status: 503 });
  if (!safeEqual(req.headers.get('x-webhook-secret') ?? '', WEBHOOK_SECRET)) {
    return new Response('forbidden', { status: 403 });
  }
  const payload = (await req.json()) as
    | { type: 'match_status'; record: MatchRecord; old_record?: { status?: string | null } | null }
    | { type?: string; record: StatLineRecord; old_record?: StatLineRecord | null };
  if (payload.type === 'field_status') {
    return handleFieldStatus((payload as unknown as { record: FieldStatusRecord }).record);
  }
  if (payload.type === 'match_status') {
    const p = payload as { record: MatchRecord; old_record?: { status?: string | null } | null };
    return handleMatchStatus(p.record, p.old_record?.status);
  }
  const { record, old_record } = payload as { record: StatLineRecord; old_record?: StatLineRecord | null };
  if (!record?.player_id) return new Response('no record', { status: 200 });

  // 0) only headline stats that INCREASED (an INSERT has no old_record → all count)
  const before = old_record?.stats ?? {};
  const rose = Object.entries(record.stats ?? {})
    .filter(([k, v]) => HEADLINE.has(k) && (Number(v) || 0) > (Number(before[k]) || 0));
  if (rose.length === 0) return new Response('no headline increase', { status: 200 });

  // 1) player name
  const { data: player } = await supabase
    .from('players')
    .select('full_name')
    .eq('id', record.player_id)
    .single();

  // 2) followers who still want score alerts (follows.prefs.scores !== false)
  const followers = await followersOf('player', [record.player_id]);
  const followerIds = [...new Set(followers.filter((f) => wants(f.prefs, 'scores')).map((f) => f.follower_id))];
  if (followerIds.length === 0) return new Response('no followers', { status: 200 });

  // 3) + 4) their devices: web push + the Expo push batch
  const headline = rose.map(([k, v]) => `${v} ${k}`).join(', ');
  const pushTitle = `${player?.full_name ?? 'A player you follow'} — ${headline}`;
  const pushBody = record.opponent ? `${record.sport} vs ${record.opponent}` : record.sport;
  const out = await sendToProfiles(followerIds, pushTitle, pushBody, {
    url: record.match_id ? `/m/${record.match_id}` : '/',
    playerId: record.player_id,
  });
  return json(out);
});
