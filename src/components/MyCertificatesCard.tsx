/** "My certificates" on your own profile — yours, and a linked parent's
 *  children's. Print any (A4, QR to its verify page) or share its check link.
 *  QR-verified certificates (migration 20261025090000_certificates). */
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { theme } from '../core/theme';
import { Card, textStyles } from './ui';
import { APP_URL } from '../core/hosts';
import { certificateUrl, formatCode, type IssuedCertificate } from '../core/certificates';
import { getMyCertificates, printCertificates, verifyCertificate } from '../data/certificates';
import { notice } from '../core/confirm';
import { shareMessage } from '../core/share';

export function MyCertificatesCard({ playerId }: { playerId: string }) {
  const [list, setList] = useState<IssuedCertificate[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    void getMyCertificates().then((l) => { if (on) setList(l); }).catch(() => on && setList([]));
    return () => { on = false; };
  }, [playerId]);
  if (!list?.length) return null;

  const print = async (c: IssuedCertificate) => {
    setBusy(c.code);
    try {
      // The issuer is the host school / club / organiser (as on the original),
      // which the certificate's own check record knows — not the tournament.
      const issuer = await verifyCertificate(c.code).then((v) => v.issuer).catch(() => undefined);
      const r = await printCertificates([c], { issuer: issuer ?? 'The organisers', title: c.title });
      if (r === 'failed') notice('Printing isn’t available here', 'Update the app, or open app.sportnnote.in on a computer and print from your profile there.');
    } finally { setBusy(null); }
  };
  const share = (c: IssuedCertificate) => void shareMessage(`${c.title}${c.tournament ? ` — ${c.tournament}` : ''}. Check it's genuine: ${certificateUrl(c.code, APP_URL)}`, 'results');

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <Text style={textStyles.h3}>📜 Certificates · {list.length}</Text>
      {list.slice(0, 20).map((c) => (
        <View key={c.code} style={{ gap: 2, paddingVertical: theme.spacing(1), borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          <Text style={[textStyles.body, { fontWeight: '700' }, c.revokedAt && { textDecorationLine: 'line-through' }]}>{c.title}</Text>
          <Text style={textStyles.muted}>{[c.tournament, c.teamName, formatCode(c.code)].filter(Boolean).join(' · ')}</Text>
          {!c.revokedAt ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing(4) }}>
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => void print(c)}>{busy === c.code ? 'Opening…' : '🖨 Print'}</Text>
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }} accessibilityRole="button" onPress={() => share(c)}>↗ Share check link</Text>
            </View>
          ) : <Text style={[textStyles.muted, { color: theme.colors.danger }]}>Revoked by the organisers</Text>}
        </View>
      ))}
    </Card>
  );
}
