/** The one sport picker (UI audit step 4, docs/security/breaks/one-of-each.md):
 *  your sports first, then the everyday ones, the rest behind "More sports…".
 *  Single (`value` + `onChange`) or multi (`values` + `onToggle`). */
import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SelectChip } from './ui';
import { theme } from '../core/theme';
import { SPORT_LIST, getSportMeta } from '../sports/sportMeta';
import { hasMore, sportChips } from '../core/sportPick';
import type { SportId } from '../core/types';

type Props = {
  mine?: readonly string[];
  /** e.g. a club's sports: only these, no "More" */
  limitTo?: readonly string[];
} & ({ value: SportId | null; onChange: (s: SportId) => void; values?: never; onToggle?: never }
  | { values: readonly SportId[]; onToggle: (s: SportId) => void; value?: never; onChange?: never });

export function SportPicker(props: Props) {
  const [showAll, setShowAll] = useState(false);
  const known = useMemo(() => SPORT_LIST.map((m) => m.id as string), []);
  const selected = props.values ?? (props.value ? [props.value] : []);
  const chips = sportChips({ known, mine: props.mine, selected, showAll, limitTo: props.limitTo });
  const pick = (s: SportId) => (props.onToggle ? props.onToggle(s) : props.onChange!(s));
  return (
    <View style={st.chips}>
      {chips.map((s) => {
        const m = getSportMeta(s as SportId);
        return <SelectChip key={s} label={`${m.icon} ${m.name}`} active={selected.includes(s as SportId)} onPress={() => pick(s as SportId)} />;
      })}
      {!showAll && !props.limitTo?.length && hasMore(chips, known) ? <SelectChip label="More sports…" active={false} onPress={() => setShowAll(true)} /> : null}
    </View>
  );
}

const st = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) } });
