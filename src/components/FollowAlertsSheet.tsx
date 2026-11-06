/** "Which alerts?" — per-follow alert choices (CricHeroes parity #23).
 *  A `Modal` sheet like ContextSwitcher: one full-width tap row per alert this
 *  follow type actually sends, a one-tap "Turn all off/on", and Save. All alerts
 *  start ticked (opt-out); only the OFF switches are stored. */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Sheet } from './Sheet';
import { theme } from '../core/theme';
import { textStyles, Button } from './ui';
import { useAuth } from '../core/auth';
import { useFollow } from '../data/hooks';
import { ALERTS, prefsFromTicked, wants, type AlertKey } from '../data/followPrefs';
import type { FollowType } from '../data/followStore';

export function FollowAlertsSheet({ visible, type, id, name, onClose, alsoIds }: {
  visible: boolean;
  type: FollowType;
  id: string;
  name: string;
  onClose: () => void;
  /** more rows to save the same choices to (a club's other sports) */
  alsoIds?: string[];
}) {
  const { profile } = useAuth();
  const { prefsOf, savePrefs } = useFollow(profile?.id);
  const options = ALERTS[type];
  const tickedFromStore = () => new Set(options.filter((o) => wants(prefsOf(type, id), o.key)).map((o) => o.key));
  const [ticked, setTicked] = useState<Set<AlertKey>>(tickedFromStore);
  const [saving, setSaving] = useState(false);

  // Fresh copy of the saved choices every time the sheet opens.
  useEffect(() => {
    if (visible) setTicked(tickedFromStore());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, type, id]);

  const toggle = (k: AlertKey) => setTicked((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const allOn = ticked.size === options.length;
  const noneOn = ticked.size === 0;
  const save = async () => {
    setSaving(true);
    const ok = await savePrefs(type, id, prefsFromTicked(type, ticked, prefsOf(type, id)));
    if (ok) for (const other of alsoIds ?? []) if (other !== id) await savePrefs(type, other, prefsFromTicked(type, ticked, prefsOf(type, other)));
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Which alerts?"
      footer={<Button variant="primary" label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} />}
    >
            <Text style={textStyles.muted}>
              For <Text style={st.bold}>{name}</Text>. Untick what you don’t need.
            </Text>
            <View style={{ gap: theme.spacing(1) }}>
              {options.map((o) => {
                const on = ticked.has(o.key);
                return (
                  <TouchableOpacity
                    key={o.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    aria-checked={on}
                    accessibilityLabel={o.label}
                    accessibilityHint={o.hint}
                    onPress={() => toggle(o.key)}
                    style={st.row}
                    activeOpacity={0.8}
                  >
                    <Text style={st.box}>{on ? '☑' : '☐'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={textStyles.body}>{o.label}</Text>
                      <Text style={textStyles.muted}>{o.hint}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setTicked(allOn ? new Set() : new Set(options.map((o) => o.key)))}
              style={st.link}
            >
              <Text style={st.linkText}>{allOn ? 'Turn all off' : 'Turn all on'}</Text>
            </TouchableOpacity>
            {noneOn && (
              <Text style={textStyles.muted}>
                You’ll get nothing for {name} — unfollow to remove it from your feed too.
              </Text>
            )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  bold: { color: theme.colors.text, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2), borderRadius: theme.radius.md, minHeight: 48 },
  box: { color: theme.colors.primary, fontSize: 24, lineHeight: 28, width: 28, textAlign: 'center' },
  link: { alignSelf: 'flex-start', paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(2) },
  linkText: { color: theme.colors.primary, fontWeight: '800', fontSize: theme.font.small },
});
