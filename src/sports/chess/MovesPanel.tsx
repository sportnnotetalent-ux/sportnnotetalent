/**
 * Deep wave — the optional move list on the chess Scoring tab: type the next
 * move(s) during the game ("Nf3", "e4 e5 Nf3", coordinates "g1f3" too) with an
 * optional clock reading, or paste the whole game (PGN from a DGT board,
 * chess.com, lichess, or a typed list) during or after it. Every move is
 * checked against the position before it is kept; the first one that isn't
 * legal is named. The opening (ECO) is read from the moves, or set by hand.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../core/theme';
import { Button, SelectChip } from '../../components/ui';
import { askConfirm } from '../../components/ConfirmSheet';
import type { ScoreAction } from '../types';
import { parseClock, openingOf, type ChessState, type Side } from './engine';
import { readMoveList, movetext } from './pgn';
import { ecoCode, nameForEco } from './openings';
import { parseFen, START_FEN } from './board';

export function MovesPanel({ state: s, dispatch, nameOf, after = false }: {
  state: ChessState;
  dispatch: (a: ScoreAction) => void;
  nameOf: (side: Side) => string;
  /** the game is over: paste / replace the whole game */
  after?: boolean;
}) {
  const [text, setText] = useState('');
  const [clk, setClk] = useState('');
  const [paste, setPaste] = useState(after);
  const [eco, setEco] = useState('');
  const [ecoOpen, setEcoOpen] = useState(false);
  const game = s.game;
  const n = game?.san.length ?? 0;
  const pos = parseFen(game?.fen ?? START_FEN);
  const toMove: Side = pos?.turn === 'b' ? (s.white === 'home' ? 'away' : 'home') : s.white;
  const read = useMemo(() => (text.trim() ? readMoveList(text, paste ? undefined : game?.fen) : null), [text, paste, game?.fen]);
  const op = openingOf(s);
  // the last few moves, numbered from where the game started
  const first = parseFen(game?.start ?? START_FEN);
  const from = Math.max(0, n - 6);
  const ply0 = from + (first?.turn === 'b' ? 1 : 0);
  const tail = game ? movetext(game.san.slice(from), (first?.fullmove ?? 1) + Math.floor(ply0 / 2), ply0 % 2 === 1) : '';
  const clkSecs = clk.trim() ? parseClock(clk) : null;
  const ok = !!read && read.san.length > 0 && !read.error;
  const save = async () => {
    if (!read || !read.san.length) return;
    if (paste) {
      if (n && !(await askConfirm({ title: 'Replace the moves?', message: `The ${n} moves recorded so far are replaced by the ${read.san.length} you pasted.`, yesLabel: 'Yes, replace', noLabel: 'No, keep them', tone: 'caution' }))) return;
      dispatch({ type: 'MOVES', payload: { pgn: text, at: Date.now() } });
    } else {
      dispatch({ type: 'MOVES', payload: { add: read.san, at: Date.now(), ...(clkSecs != null ? { clk: clkSecs } : {}) } });
    }
    setText(''); setClk('');
  };
  return (
    <View style={st.box}>
      <View style={st.head}>
        <Text style={st.label}>♟ Moves{n ? ` (${Math.ceil(n / 2)})` : ''}</Text>
        {op ? <Text style={st.meta} numberOfLines={1}>{op.eco} · {op.name}</Text> : null}
      </View>
      {n ? <Text style={st.moves} numberOfLines={2}>{n > 6 ? '… ' : ''}{tail}</Text> : null}
      {!after && !paste && pos ? <Text style={st.meta}>{pos.turn === 'w' ? '♔ White' : '♚ Black'} to move · {nameOf(toMove)}</Text> : null}
      <TextInput
        style={[st.input, paste && st.multi, read?.error ? st.bad : null]}
        value={text}
        onChangeText={setText}
        multiline={paste}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={paste ? 'Paste the game (PGN) or type the moves: 1. e4 e5 2. Nf3 Nc6 …' : 'Next move: Nf3 (or several: e4 e5 Nf3)'}
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel={paste ? 'The game\'s moves (PGN)' : 'Next move'}
      />
      {read ? (
        <Text style={[st.meta, read.error ? st.err : st.okText]}>
          {read.error
            ? `${read.san.length ? `${read.san.length} move${read.san.length === 1 ? '' : 's'} read, then ` : ''}${read.error.reason}`
            : `✓ ${read.san.length} move${read.san.length === 1 ? '' : 's'}: ${read.san.slice(-4).join(' ')}${read.clocks.some((x) => x != null) ? ' · clocks read' : ''}`}
        </Text>
      ) : null}
      {!paste && s.track?.clock ? (
        <TextInput style={[st.input, clk && clkSecs == null ? st.bad : null]} value={clk} onChangeText={(t) => setClk(t.replace(/[^0-9:m]/gi, ''))}
          placeholder="⏱ Clock after this move (optional · 1:23:05 or 4:07)" placeholderTextColor={theme.colors.textMuted} accessibilityLabel="Clock left after this move" />
      ) : null}
      <View style={st.row}>
        <Button label={paste ? (n ? 'Replace the moves…' : 'Save the moves') : 'Add move'} style={{ flex: 1 }} disabled={!ok} onPress={() => void save()} />
        {!paste && n ? <Button label="⌫ Last move" variant="ghost" onPress={() => dispatch({ type: 'MOVES', payload: { drop: 1 } })} /> : null}
      </View>
      {!after ? (
        <Text style={st.link} accessibilityRole="button" onPress={() => { setPaste(!paste); setText(''); }}>
          {paste ? '↩ Type moves one by one' : '📋 Paste a whole game (PGN)…'}
        </Text>
      ) : null}
      {/* the opening by hand (no moves, or a transposition the table misses) */}
      {ecoOpen ? (
        <View style={st.row}>
          <TextInput style={[st.input, { flex: 1 }, eco && !ecoCode(eco) ? st.bad : null]} value={eco} onChangeText={(t) => setEco(t.toUpperCase().slice(0, 3))}
            placeholder="ECO, e.g. B90" placeholderTextColor={theme.colors.textMuted} autoCapitalize="characters" accessibilityLabel="Opening ECO code" />
          <Button label="Set" disabled={!ecoCode(eco)} onPress={() => { dispatch({ type: 'OPENING', payload: { eco: ecoCode(eco) } }); setEcoOpen(false); setEco(''); }} />
          {s.opening?.manual ? <Button label="Clear" variant="ghost" onPress={() => { dispatch({ type: 'OPENING', payload: {} }); setEcoOpen(false); }} /> : null}
        </View>
      ) : (
        <View style={st.chips}>
          <SelectChip label={op ? `Opening: ${op.eco}` : 'Opening (ECO)…'} active={!!s.opening?.manual} onPress={() => setEcoOpen(true)} />
          {eco && ecoCode(eco) ? <Text style={st.meta}>{nameForEco(ecoCode(eco)!) ?? ''}</Text> : null}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  box: { gap: theme.spacing(2), padding: theme.spacing(3), borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  label: { color: theme.colors.text, fontSize: theme.font.body, fontWeight: '800' },
  meta: { flex: 1, color: theme.colors.textMuted, fontSize: theme.font.small },
  moves: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '700' },
  err: { color: theme.colors.danger, fontWeight: '700' },
  okText: { color: theme.colors.primary, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.inputBorder, color: theme.colors.text,
    borderRadius: theme.radius.md, paddingVertical: theme.spacing(2), paddingHorizontal: theme.spacing(3), fontSize: theme.font.body,
  },
  multi: { minHeight: 96, textAlignVertical: 'top' },
  bad: { borderColor: theme.colors.danger },
  row: { flexDirection: 'row', gap: theme.spacing(2), alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), alignItems: 'center' },
  link: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
});
