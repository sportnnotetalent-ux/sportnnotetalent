/**
 * invite-joined — "Join me on SportnNote" (2026-10-23). A friend who signed up
 * from someone's personal invite (app.sportnnote.in/get/<inviter>) lets the
 * inviter know they joined, with a tap through to their profile to follow back.
 * push-send can't carry this: a brand-new member shares no team / match /
 * tournament with the inviter yet (push_allowed_targets).
 *
 * Body: { inviterPlayerId: string }
 *
 * Abuse guards:
 *   - signed-in caller, rate limited;
 *   - a NEW account (created in the last 14 days);
 *   - the caller already follows the inviter (the app follows them first, so
 *     this can't be aimed at a stranger without following them);
 *   - once per account, ever (app_metadata.invite_joined_notified — only the
 *     service role can write app_metadata);
 *   - an under-18 member is never named: the inviter hears "A friend joined".
 *
 * Deploy:  supabase functions deploy invite-joined
 */
import { admin, clip, CORS, json, pushToProfiles, rateLimit, requireUser, stripLinks, tooMany } from '../_shared/guard.ts';
import { webPushToProfiles } from '../_shared/webpush.ts';

const NEW_ACCOUNT_DAYS = 14;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whole years from a YYYY-MM-DD date of birth (null when unknown). */
function ageOn(dob: string | null | undefined, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age -= 1;
  return age;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const caller = await requireUser(req);
  if (caller instanceof Response) return caller;
  if (!(await rateLimit('invite-joined', caller.user.id, 5, 3600))) return tooMany();

  const raw = (await req.json().catch(() => ({}))) as { inviterPlayerId?: unknown };
  const inviter = typeof raw.inviterPlayerId === 'string' ? raw.inviterPlayerId : '';
  if (!UUID.test(inviter)) return json({ error: 'inviterPlayerId is required' }, 400);

  // a new account, told once
  const { data: got } = await admin.auth.admin.getUserById(caller.user.id);
  const user = got?.user;
  if (!user) return json({ sent: 0, reason: 'no account' });
  if (user.app_metadata?.invite_joined_notified) return json({ sent: 0, reason: 'already told' });
  if (Date.now() - new Date(user.created_at).getTime() > NEW_ACCOUNT_DAYS * 86_400_000) return json({ sent: 0, reason: 'not a new account' });

  // they follow the inviter (the app did that first)
  const { data: follow } = await admin.from('follows').select('follower_id')
    .eq('follower_id', caller.user.id).eq('target_type', 'player').eq('target_id', inviter).maybeSingle();
  if (!follow) return json({ sent: 0, reason: 'not following the inviter' });

  const { data: inv } = await admin.from('players').select('profile_id').eq('id', inviter).maybeSingle();
  if (!inv?.profile_id || inv.profile_id === caller.user.id) return json({ sent: 0, reason: 'no inviter account' });

  // the new member's own (oldest) player: their name, and where "follow back" goes
  const { data: mine } = await admin.from('players').select('id, full_name, dob, created_at')
    .eq('profile_id', caller.user.id).order('created_at', { ascending: true }).limit(1);
  const me = mine?.[0] as { id: string; full_name: string | null; dob: string | null } | undefined;
  const adult = (ageOn(me?.dob, new Date()) ?? 0) >= 18;
  const name = adult ? stripLinks(clip(me?.full_name ?? '', 60)) : '';

  await admin.auth.admin.updateUserById(caller.user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), invite_joined_notified: new Date().toISOString() },
  });

  const title = `🎉 ${name || 'A friend'} joined from your invite`;
  const body = adult && me ? 'Tap to see their profile and follow back.' : 'Say hi next time you play.';
  const profilePath = adult && me ? `/p/${me.id}` : '/';
  const [app, web] = await Promise.all([
    pushToProfiles([inv.profile_id], { title, body, data: adult && me ? { url: `sportnnote://p/${me.id}` } : {} }),
    webPushToProfiles([inv.profile_id], { title, body, url: profilePath, tag: `joined-${caller.user.id}` }),
  ]);
  return json({ sent: app, web });
});
