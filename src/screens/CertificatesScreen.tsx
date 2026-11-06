/** Issue and print a tournament's certificates (organisers). Pre-fills the
 *  champions / runners-up / third place from the knockout final and the
 *  third-place match (change any of them), the published awards, the meet
 *  medals and — if wanted — participation for every squad member. Each
 *  certificate prints on its own A4 page with a QR to its public verify page.
 *  QR-verified certificates — migration 20261025090000_certificates. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { KeyboardAwareScrollView, KeyboardFooterLayout } from '../components/keyboard';
import { theme } from '../core/theme';
import { Button, Card, EmptyState, FormError, LoadingState, Pill, ScreenTitle, SelectChip, TextField, textStyles } from '../components/ui';
import { useAuth } from '../core/auth';
import { canManageTournament } from '../core/org';
import { useMatches, useOrganizations, useTournamentById } from '../data/hooks';
import { getMyPlayerId, getPlayerNamesById, getRoster, getTeamRosters, getTournamentAwards, getTournamentTeams } from '../data/repos';
import { getMeet } from '../data/resultsStore';
import { meetMedalists } from '../data/results/athletics';
import { detectPlaces, type TournamentPlaces } from '../data/certificatePlaces';
import { getSportMeta } from '../sports/sportMeta';
import {
  KIND_LABEL, awardItems, dedupeItems, formatCode, medalItems, participationItems, placementItems,
  type CertificateItem, type CertKind, type IssuedCertificate,
} from '../core/certificates';
import { getTournamentCertificates, issueCertificates, printCertificates, revokeCertificate } from '../data/certificates';
import type { Match, SportId, Team, TournamentAwards } from '../core/types';
import type { RootStackParamList } from '../navigation/types';

/** Common reasons to revoke a certificate (any text is fine too). */
const REVOKE_REASONS = ['Issued to the wrong player', 'Wrong team or place', 'The result was changed', 'Issued by mistake'] as const;

type Places = TournamentPlaces;

export default function CertificatesScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'Certificates'>>();
  const { profile } = useAuth();
  const tournament = useTournamentById(params.tournamentId);
  const orgs = useOrganizations();
  const { matches: allMatches } = useMatches('all');
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [rosters, setRosters] = useState<Map<string, string[]>>(new Map());
  const [awards, setAwards] = useState<TournamentAwards | undefined>(undefined);
  const [medals, setMedals] = useState<ReturnType<typeof meetMedalists>>([]);
  const [issued, setIssued] = useState<IssuedCertificate[]>([]);
  // the certificate being revoked (its code) and why
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [places, setPlaces] = useState<Record<string, Places>>({});
  const [withAwards, setWithAwards] = useState(true);
  const [withMedals, setWithMedals] = useState(true);
  const [withParticipation, setWithParticipation] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  const tid = params.tournamentId;
  const matches = useMemo(() => allMatches.filter((m) => m.tournamentId === tid), [allMatches, tid]);
  useEffect(() => { void getMyPlayerId(profile?.id).then(setMyPlayerId); }, [profile?.id]);

  const load = useCallback(async () => {
    const registered = await getTournamentTeams(tid).catch(() => [] as Team[]);
    // plus every team that played here (a tournament run without a registered list)
    const fromMatches = allMatches.filter((m) => m.tournamentId === tid).flatMap((m) => [m.homeTeam, m.awayTeam]).filter((t): t is Team => !!t?.id);
    const ts = [...new Map([...registered, ...fromMatches].map((t) => [t.id, t])).values()];
    setTeams(ts);
    const rs = await getTeamRosters(ts.map((t) => t.id)).catch(() => new Map<string, string[]>());
    // a school house's squad is its players (no explicit roster): the match screens' roster read
    await Promise.all(ts.filter((t) => !rs.get(t.id)?.length).map(async (t) => {
      const ps = await getRoster(t.name, t.sport, t.id).catch(() => []);
      if (ps.length) rs.set(t.id, ps.map((p) => p.id));
    }));
    setRosters(rs);
    setAwards(await getTournamentAwards(tid).catch(() => undefined));
    setIssued(await getTournamentCertificates(tid));
    try { setMedals(meetMedalists(await getMeet(tid, () => 'Athlete', 'all'))); } catch { setMedals([]); }
  }, [tid, allMatches]);
  useEffect(() => { void load(); }, [load]);

  // team / individual sports with matches here, and their detected places
  const sports = useMemo(() => [...new Set(matches.map((m) => m.sport))] as SportId[], [matches]);
  useEffect(() => {
    setPlaces((cur) => {
      const next = { ...cur };
      for (const s of sports) if (!next[s]) next[s] = detectPlaces(matches.filter((m) => m.sport === s));
      return next;
    });
  }, [sports, matches]);

  const teamName = useCallback((id: string) => teams?.find((t) => t.id === id)?.name ?? 'Team', [teams]);
  const date = tournament?.endDate ?? tournament?.startDate;
  const tName = tournament?.name ?? 'Tournament';

  const items = useMemo<CertificateItem[]>(() => {
    if (!teams) return [];
    const out: CertificateItem[] = [];
    for (const s of sports) {
      const sm = getSportMeta(s);
      out.push(...placementItems({ tournamentName: tName, sport: s, sportName: sm.name, eventDate: date, rosters, teamName, ...places[s] }));
      if (withParticipation) {
        const ids = teams.filter((t) => t.sport === s).map((t) => t.id);
        out.push(...participationItems({ tournamentName: tName, sport: s, sportName: sm.name, eventDate: date, rosters, teamName, teamIds: ids }));
      }
    }
    if (withAwards && awards?.publishedAt) out.push(...awardItems(awards.items, { tournamentName: tName, sportName: (sp) => getSportMeta(sp as SportId).name, eventDate: date }));
    if (withMedals) out.push(...medalItems(medals, { tournamentName: tName, eventDate: date }));
    return dedupeItems(out);
  }, [teams, sports, places, rosters, teamName, withParticipation, withAwards, awards, withMedals, medals, tName, date]);

  const key = (c: { playerId: string; kind: string; title: string; detail?: string }) => `${c.playerId}|${c.kind}|${c.title}|${c.detail ?? ''}`;
  // Only live certificates count as issued: a revoked one can be issued again.
  const issuedKeys = useMemo(() => new Set(issued.filter((c) => !c.revokedAt).map(key)), [issued]);
  const fresh = items.filter((i) => !issuedKeys.has(key(i)));

  useEffect(() => {
    const ids = [...new Set(issued.map((c) => c.playerId))];
    if (ids.length) void getPlayerNamesById(ids).then(setNames);
  }, [issued]);

  const issuer = (tournament?.hostOrgId && orgs.find((o) => o.id === tournament.hostOrgId)?.name) || tournament?.hostName || 'The organisers';
  const isManager = !!tournament && canManageTournament(tournament, orgs, myPlayerId, profile?.id);

  const issue = async () => {
    setBusy('issue'); setError(null); setNote(null);
    try {
      const all = await issueCertificates(tid, fresh);
      setIssued(all);
      setNote(`☑️ ${fresh.length} certificate${fresh.length === 1 ? '' : 's'} issued. Print them below.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t issue them — try again.'); }
    finally { setBusy(null); }
  };
  const print = async (list: IssuedCertificate[], label: string) => {
    setBusy(label); setError(null);
    try {
      const r = await printCertificates(list.filter((c) => !c.revokedAt), { issuer, title: `${tName} — certificates` });
      if (r === 'failed') setError('Printing isn’t available here — open SportnNote on a computer (app.sportnnote.in) to print.');
    } finally { setBusy(null); }
  };
  const startRevoke = (c: IssuedCertificate) => { setRevoking(c.code); setRevokeReason(''); setError(null); };
  const revoke = async (c: IssuedCertificate) => {
    if (!revokeReason.trim()) { setError('Say why it’s being revoked — it shows when the certificate is checked.'); return; }
    setBusy(`revoke:${c.code}`);
    try {
      await revokeCertificate(c.code, revokeReason.trim());
      setIssued(await getTournamentCertificates(tid));
      setRevoking(null);
      setNote(`${formatCode(c.code)} revoked. If it went to the wrong player or team, pick the right one above and issue it again.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t revoke it.'); }
    finally { setBusy(null); }
  };

  if (!tournament || teams === null) return <SafeAreaView style={st.safe}><LoadingState label="Loading results…" /></SafeAreaView>;
  if (!isManager) {
    return <SafeAreaView style={st.safe}><View style={st.content}><EmptyState icon="🔒" title="Organisers only" hint="Only this tournament’s organisers can issue certificates." /></View></SafeAreaView>;
  }

  const byKind = (k: CertKind) => issued.filter((c) => c.kind === k && !c.revokedAt);
  const kinds = (Object.keys(KIND_LABEL) as CertKind[]).filter((k) => byKind(k).length);

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardFooterLayout footer={fresh.length ? (
        <>
          <FormError message={error} />
          <Button variant="primary" label={busy === 'issue' ? 'Issuing…' : `🏅 Issue ${fresh.length} certificate${fresh.length === 1 ? '' : 's'}`} onPress={() => void issue()} disabled={!!busy} />
        </>
      ) : null}>
        <KeyboardAwareScrollView contentContainerStyle={st.content}>
          <ScreenTitle title="Certificates" subtitle={tName} />
          <Text style={textStyles.muted}>
            Every certificate gets a QR code — scanning it shows it’s genuine (what was won, where, when, issued by {issuer}). Under-18s show as initials on that public page.
          </Text>
          {note ? <Text style={st.note} accessibilityRole="alert">{note}</Text> : null}

          {sports.map((s) => {
            const sm = getSportMeta(s);
            const sportTeams = teams.filter((t) => t.sport === s);
            const pl = places[s] ?? {};
            const row = (label: string, k: keyof Places) => (
              <View style={{ gap: theme.spacing(1) }} key={k}>
                <Text style={textStyles.muted}>{label}</Text>
                <View style={st.chips}>
                  <SelectChip label="None" active={!pl[k]} onPress={() => setPlaces((cur) => ({ ...cur, [s]: { ...cur[s], [k]: undefined } }))} />
                  {sportTeams.map((t) => (
                    <SelectChip key={t.id} label={`${t.name}${rosters.get(t.id)?.length ? ` · ${rosters.get(t.id)!.length}` : ''}`} active={pl[k] === t.id}
                      onPress={() => setPlaces((cur) => ({ ...cur, [s]: { ...cur[s], [k]: t.id } }))} />
                  ))}
                </View>
              </View>
            );
            return (
              <Card key={s} style={{ gap: theme.spacing(2) }}>
                <Text style={textStyles.h3}>{sm.icon} {sm.name}</Text>
                {row('🏆 Champions', 'champion')}
                {row('🥈 Runners-up', 'runnerUp')}
                {row('🥉 Third place', 'third')}
                <Text style={textStyles.muted}>Every player in the team’s squad gets one. Filled in from the final and the third-place match — change any if needed.</Text>
              </Card>
            );
          })}

          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>Also include</Text>
            <View style={st.chips}>
              <SelectChip label={`🎖️ Awards${awards?.publishedAt ? ` · ${awards.items.length}` : ' (not published yet)'}`} active={withAwards && !!awards?.publishedAt} onPress={() => setWithAwards((v) => !v)} />
              {medals.length ? <SelectChip label={`🥇 Meet medals · ${medals.reduce((n, m) => n + m.playerIds.length, 0)}`} active={withMedals} onPress={() => setWithMedals((v) => !v)} /> : null}
              <SelectChip label="🎽 Participation (everyone)" active={withParticipation} onPress={() => setWithParticipation((v) => !v)} />
            </View>
          </Card>

          <Text style={textStyles.muted}>
            {fresh.length ? `${fresh.length} new certificate${fresh.length === 1 ? '' : 's'} ready to issue.` : items.length ? 'Everything above is already issued.' : 'Pick the champions (or include awards / medals / participation) to issue certificates.'}
          </Text>

          {issued.length > 0 && (
            <Card style={{ gap: theme.spacing(2) }}>
              <Text style={textStyles.h3}>Issued · {issued.filter((c) => !c.revokedAt).length}</Text>
              <Button label={busy === 'all' ? 'Opening…' : `🖨 Print all (${issued.filter((c) => !c.revokedAt).length})`} onPress={() => void print(issued, 'all')} disabled={!!busy} />
              <View style={st.chips}>
                {kinds.map((k) => <SelectChip key={k} label={`🖨 ${KIND_LABEL[k]} · ${byKind(k).length}`} active={false} onPress={() => void print(byKind(k), k)} />)}
              </View>
              <Text style={st.link} onPress={() => setShowList((v) => !v)}>{showList ? 'Hide the list' : 'Show each certificate (codes, revoke)'}</Text>
              {showList && issued.map((c) => (
                <View key={c.code} style={st.certRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[textStyles.body, c.revokedAt && st.struck]}>{names.get(c.playerId) ?? 'Player'} · {c.title}</Text>
                    <Text style={textStyles.muted}>{formatCode(c.code)}{c.teamName ? ` · ${c.teamName}` : ''}</Text>
                  </View>
                  {c.revokedAt ? <Pill label="revoked" /> : revoking === c.code ? null : <Text style={st.revoke} accessibilityRole="button" onPress={() => startRevoke(c)}>Revoke</Text>}
                </View>
              )).flatMap((row, i) => {
                const c = issued[i];
                if (revoking !== c.code) return [row];
                return [row, (
                  <View key={`${c.code}-revoke`} style={st.revokeBox}>
                    <Text style={textStyles.muted}>Why revoke {formatCode(c.code)}? Scanning it will show “revoked” and this reason.</Text>
                    <View style={st.chips}>
                      {REVOKE_REASONS.map((r) => <SelectChip key={r} label={r} active={revokeReason === r} onPress={() => setRevokeReason(revokeReason === r ? '' : r)} />)}
                    </View>
                    <TextField label="Or type a reason" value={(REVOKE_REASONS as readonly string[]).includes(revokeReason) ? '' : revokeReason} onChange={setRevokeReason} placeholder="e.g. Wrong age group" />
                    <View style={st.row}>
                      <Button label="Keep it" variant="ghost" style={st.flex} onPress={() => setRevoking(null)} disabled={!!busy} />
                      <Button label={busy === `revoke:${c.code}` ? 'Revoking…' : 'Revoke'} variant="danger" style={st.flex} onPress={() => void revoke(c)} disabled={!!busy} />
                    </View>
                  </View>
                )];
              })}
            </Card>
          )}
          {error && !fresh.length ? <FormError message={error} /> : null}
        </KeyboardAwareScrollView>
      </KeyboardFooterLayout>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) },
  note: { color: theme.colors.primary, fontWeight: '700' },
  link: { color: theme.colors.primary, fontWeight: '700', fontSize: theme.font.small },
  certRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2), paddingVertical: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border },
  revoke: { color: theme.colors.danger, fontWeight: '700', fontSize: theme.font.small },
  revokeBox: { gap: theme.spacing(2), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceAlt },
  row: { flexDirection: 'row', gap: theme.spacing(2) },
  flex: { flex: 1 },
  struck: { textDecorationLine: 'line-through' },
});
