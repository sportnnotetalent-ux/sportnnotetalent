/** The SportnNote top bar (founder 2026-11-08, docs/security/breaks/brand-bar.md):
 *  the name on its cream badge (tap → Home), search, alerts and the quick-actions
 *  menu. One look on Home, the other tab screens and, on wide web, every
 *  signed-in screen. Where it shows: src/core/brandBar.ts. */
import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { setStatusBarStyle } from 'expo-status-bar';
import { Search, Bell, Menu } from 'lucide-react-native';
import { theme } from '../core/theme';
import { useAuth } from '../core/auth';
import { canStartFriendly } from '../core/roles';
import { brandHeight, isWideWeb, BAR_ICON, BAR_GAP, BAR_PAD } from '../core/brandBar';
import { useNotifications } from '../data/hooks';
import { navRef } from '../navigation/navRef';
import { Glyph } from './Icon';
import { Wordmark } from './Wordmark';

type Go = (name: string, params?: object) => void;

type Props = {
  /** already on Home: the name does nothing (BB11) */
  onHome?: boolean;
  /** Home opens its own voice panel; elsewhere Voice opens Home with it (BB6) */
  onVoice?: () => void;
  /** inside Home's green hero: no background, no inset (the hero has them) */
  embedded?: boolean;
  /** a tab screen's own bar: hidden on wide web, where the root draws it (BB4) */
  tab?: boolean;
};

/** For a screen inside the navigator: light status-bar text while focused (BB7). */
export function BrandBar({ tab, ...props }: Props) {
  const nav = useNavigation<{ navigate: Go }>();
  const { width } = useWindowDimensions();
  useFocusEffect(useCallback(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle('dark');
  }, []));
  if (tab && isWideWeb(Platform.OS, width)) return null;
  return <BrandBarView {...props} go={(n, p) => nav.navigate(n, p)} />;
}

/** For the root on wide web, outside any screen (BB4). */
export function RootBrandBar({ onHome }: { onHome: boolean }) {
  const go: Go = (n, p) => { if (navRef.isReady()) (navRef.navigate as unknown as Go)(n, p); };
  return <BrandBarView onHome={onHome} go={go} />;
}

function BrandBarView({ onHome, onVoice, embedded, go }: Props & { go: Go }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { profile } = useAuth();
  const { unread } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = [
    { icon: '🎙', label: 'Voice — find a game', onPress: () => (onVoice ? onVoice() : go('Tabs', { screen: 'Home', params: { voice: true } })) },
    ...(canStartFriendly(profile?.role) ? [{ icon: '🤝', label: 'Start a friendly', onPress: () => go('ScheduleMatch', {}) }] : []),
    { icon: '📅', label: 'Calendar', onPress: () => go('Calendar') },
  ];
  const top = embedded ? 0 : insets.top;

  return (
    <View style={[st.row, !embedded && st.bar, { paddingTop: top + (embedded ? 0 : theme.spacing(3)) }]} accessibilityRole="header">
      <View style={st.brand}>
        <TouchableOpacity
          style={st.badge}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="SportnNote, go to Home"
          onPress={onHome ? undefined : () => go('Tabs', { screen: 'Home' })}
        >
          <Wordmark height={brandHeight(width)} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={st.iconBtn}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Search players, teams, matches and tournaments"
        onPress={() => go('Tabs', { screen: 'Discover', params: { mode: 'people', focus: true } })}
      >
        <Search color={theme.colors.heroText} size={20} strokeWidth={2.2} />
      </TouchableOpacity>
      <TouchableOpacity
        style={st.iconBtn}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onPress={() => go('Notifications')}
      >
        <Bell color={theme.colors.heroText} size={20} strokeWidth={2.2} />
        {unread > 0 && (
          <View style={st.count}>
            <Text style={st.countText} maxFontSizeMultiplier={1.5}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={st.iconBtn}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ expanded: menuOpen }} aria-expanded={menuOpen}
        accessibilityLabel="Quick actions"
        onPress={() => setMenuOpen((v) => !v)}
      >
        <Menu color={theme.colors.heroText} size={20} strokeWidth={2.2} />
      </TouchableOpacity>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={st.backdrop} onPress={() => setMenuOpen(false)} accessibilityRole="button" accessibilityLabel="Close menu">
          <View style={[st.menu, { top: insets.top + 60, right: Platform.OS === 'web' && width > 1024 ? (width - 1024) / 2 + BAR_PAD : BAR_PAD }]} onStartShouldSetResponder={() => true}>
            {items.map((item, idx) => (
              <React.Fragment key={item.label}>
                {idx > 0 && <View style={st.divider} />}
                <TouchableOpacity
                  style={st.menuRow}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  onPress={() => { setMenuOpen(false); item.onPress(); }}
                >
                  <Glyph emoji={item.icon} style={st.menuIcon} color={theme.colors.primary} />
                  <Text style={st.menuLabel}>{item.label}</Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: BAR_GAP },
  // a bar of its own: the same pitch green as Home's hero
  bar: { backgroundColor: theme.colors.primaryDark, paddingHorizontal: BAR_PAD, paddingBottom: theme.spacing(3) },
  brand: { flex: 1, alignItems: 'flex-start' },
  // BC4 (brand-cream.md): the name sits on a cream badge, never straight on green
  badge: { backgroundColor: theme.colors.bg, borderRadius: theme.radius.sm, paddingVertical: 4, paddingLeft: 4, paddingRight: 8 },
  iconBtn: {
    width: BAR_ICON, height: BAR_ICON, borderRadius: BAR_ICON / 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  count: {
    position: 'absolute', top: -2, right: -2, minWidth: 20, minHeight: 20, borderRadius: 10,
    backgroundColor: theme.colors.dangerStrong, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: theme.colors.primaryDark,
  },
  countText: { color: '#fff', fontSize: theme.font.tiny, fontWeight: '800' },
  backdrop: { flex: 1 },
  menu: { position: 'absolute', minWidth: 232, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: theme.spacing(1), shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), paddingVertical: theme.spacing(3), paddingHorizontal: theme.spacing(4) },
  menuIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  menuLabel: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '600' },
  divider: { height: 1, backgroundColor: theme.colors.border, marginHorizontal: theme.spacing(3) },
});
