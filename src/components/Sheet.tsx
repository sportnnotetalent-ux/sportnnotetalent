/**
 * One bottom-sheet shell for the app (reference-video B7): a grab handle, a
 * title, ✕ (or ‹ Back) on the right, and scrolling content. Keyboard-safe
 * (useKeyboardSheet + KeyboardSheetScope, so a field is never hidden), Android
 * back closes it, a tap on the backdrop closes it, and screen readers stay
 * inside it while it is open.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView, KeyboardSheetScope, useKeyboardSheet } from './keyboard';
import { theme } from '../core/theme';

export function Sheet({
  visible,
  onClose,
  title,
  onBack,
  children,
  footer,
  closeLabel,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** a sub-panel is open: the corner shows ‹ Back and calls this */
  onBack?: () => void;
  children: React.ReactNode;
  /** pinned under the content (e.g. the sheet's main button) */
  footer?: React.ReactNode;
  /** what the backdrop says to a screen reader */
  closeLabel?: string;
}) {
  const kb = useKeyboardSheet(visible);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[st.backdrop, kb.backdrop]} onPress={onClose} accessibilityLabel={closeLabel ?? `Close ${title}`}>
        <Pressable ref={kb.panel} style={[st.sheet, kb.sheet]} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
          <KeyboardSheetScope value={kb.scope}>
            <View style={st.grab} />
            <View style={st.head}>
              <Text style={st.title} accessibilityRole="header" numberOfLines={2}>{title}</Text>
              <Text style={st.close} accessibilityRole="button" accessibilityLabel={onBack ? 'Back' : 'Close'} onPress={onBack ?? onClose}>
                {onBack ? '‹ Back' : '✕'}
              </Text>
            </View>
            <KeyboardAwareScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled">
              {children}
            </KeyboardAwareScrollView>
            {footer ? <View style={st.footer}>{footer}</View> : null}
          </KeyboardSheetScope>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Grouped rows with a small caption (Manage-style lists inside a sheet). */
export function SheetGroup({ caption, children }: { caption?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: theme.spacing(2) }}>
      {caption ? <Text style={st.caption}>{caption}</Text> : null}
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing(4), paddingTop: theme.spacing(2),
    maxHeight: '85%', width: '100%', maxWidth: 640, alignSelf: 'center',
  },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginBottom: theme.spacing(2) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(3), marginBottom: theme.spacing(3) },
  title: { flex: 1, color: theme.colors.text, fontSize: theme.font.h3, fontWeight: '700' },
  close: { color: theme.colors.primary, fontSize: theme.font.body, fontWeight: '700', padding: theme.spacing(1) },
  body: { gap: theme.spacing(3), paddingBottom: theme.spacing(2) },
  footer: { paddingTop: theme.spacing(3), gap: theme.spacing(2) },
  caption: { color: theme.colors.textMuted, fontSize: theme.font.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
});
