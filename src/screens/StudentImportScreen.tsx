/** Student lists (2026-10-27, founder 1A / 2A / 3A): a school adds its students
 *  in bulk — the whole school, one class or one section — from a CSV, an Excel
 *  file (web) or pasted rows. "Check the list" asks the server which rows are
 *  students the school already has (admission number, name + date of birth,
 *  first name + a parent's contact), children already on SportnNote elsewhere
 *  (their parent is asked by email; the school sees nothing of them), or new.
 *  The preview shows what will happen to each; nothing is created twice;
 *  existing students move to the class the list gives them; a whole-school
 *  list can mark the students missing from it as left — only if ticked.
 *  Pure plan: data/studentList.ts; reads and writes: data/studentListStore.ts. */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { KeyboardAwareScrollView, KeyboardFooterLayout } from '../components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { theme } from '../core/theme';
import { Button, Card, ScreenTitle, SelectChip, TextField, FormError, LoadingState, textStyles } from '../components/ui';
import { getOrganization, getPlayers } from '../data/repos';
import { parseRoster, ageOn } from '../data/rosterImport';
import {
  classLabelsOf, matchInputs, needsLeaverConfirm, planStudents, sortClasses, splitClassSection, STUDENT_TEMPLATE,
  type CheckChoice, type ListScope, type PlannedStudent, type RowMatch, type StudentAction,
} from '../data/studentList';
import { applyStudentList, getAdmissionNos, matchStudents, type ApplyResult } from '../data/studentListStore';
import { useRegion, spelledDate, dateOrderWords, type DateOrder } from '../core/region';
import { defaultPhoneCountry } from '../core/phone';
import { pickSheetFile } from '../core/document';
import { downloadText } from '../core/download';
import { todayIn } from '../core/time';
import { confirmAction, notice } from '../core/confirm';
import type { RootStackParamList } from '../navigation/types';
import type { Organization, Player } from '../core/types';
import { IconText } from '../components/Icon';

const GROUPS: { action: StudentAction; title: string }[] = [
  { action: 'check', title: '❓ Need a look' },
  { action: 'new', title: '＋ New students' },
  { action: 'move', title: '↗ Moving to another class' },
  { action: 'rejoin', title: '↩ Back at the school' },
  { action: 'update', title: '✎ House or admission number updated' },
  { action: 'parent', title: '✉ Already on SportnNote — we’ll ask their parent' },
  { action: 'invited', title: '✉ Parent asked before' },
  { action: 'same', title: '✓ Already here, nothing changes' },
  { action: 'skip', title: '✗ Not added' },
];
const SHOW = 40;

export default function StudentImportScreen() {
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'StudentImport'>>();
  const region = useRegion();
  const [org, setOrg] = useState<Organization | null>(null);
  const [players, setPlayers] = useState<Map<string, Player>>(new Map());
  const [admission, setAdmission] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [scopeKind, setScopeKind] = useState<ListScope['kind']>('school');
  const [cls, setCls] = useState('');
  const [section, setSection] = useState('');
  const [text, setText] = useState('');
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [forceOrder, setForceOrder] = useState<DateOrder | undefined>(undefined);
  const [matches, setMatches] = useState<RowMatch[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [choices, setChoices] = useState<Record<number, CheckChoice>>({});
  const [markLeft, setMarkLeft] = useState(false);
  const [open, setOpen] = useState<Partial<Record<StudentAction, boolean>>>({ check: true, new: true, move: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ApplyResult | null>(null);

  const load = async () => {
    const [o, ps, adm] = await Promise.all([getOrganization(params.orgId), getPlayers(), getAdmissionNos(params.orgId)]);
    setOrg(o); setPlayers(new Map(ps.map((p) => [p.id, p]))); setAdmission(adm);
  };
  useEffect(() => {
    let on = true;
    load().catch((e) => on && setError(e instanceof Error ? e.message : 'Couldn’t load the school')).finally(() => on && setLoading(false));
    return () => { on = false; };
  }, [params.orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const members = org?.members ?? [];
  const labels = useMemo(() => classLabelsOf(members), [members]);
  // The school's classes and each class's sections, for the "One class" pickers.
  const classes = useMemo(() => [...new Set(sortClasses(labels).map((l) => splitClassSection(l).cls))], [labels]);
  const sectionsOf = (c: string) => [...new Set(labels.map(splitClassSection).filter((x) => x.cls === c && x.section).map((x) => x.section!))].sort();
  const scope: ListScope = scopeKind === 'school' ? { kind: 'school' } : { kind: 'class', cls: cls.trim(), ...(section.trim() ? { section: section.trim() } : {}) };

  const parsed = useMemo(() => (text.trim() ? parseRoster(text, { order: region.dateOrder, country: defaultPhoneCountry(), forceOrder }) : null), [text, region.dateOrder, forceOrder]);
  const rows = parsed?.rows ?? [];
  const inputs = useMemo(() => matchInputs(rows, scope, labels), [rows, scopeKind, cls, section, labels]); // eslint-disable-line react-hooks/exhaustive-deps
  // A changed list or class needs checking again.
  useEffect(() => { setMatches(null); setChoices({}); }, [text, forceOrder, scopeKind, cls, section]);
  const plan = useMemo(() => (matches ? planStudents({ rows, matches, members, admission, scope, labels, choices }) : null),
    [matches, rows, members, admission, choices, labels, scopeKind, cls, section]); // eslint-disable-line react-hooks/exhaustive-deps

  async function chooseFile() {
    setError(null);
    const f = await pickSheetFile();
    if (!f) return;
    if (f.error) { setError(f.error); return; }
    if (!f.text) { setError('Save it as CSV or Excel (.xlsx) first, or copy the cells and paste them here.'); return; }
    setFileNote(`Loaded ${f.name}`); setForceOrder(undefined); setText(f.text); setDone(null);
  }

  async function check() {
    if (scopeKind === 'class' && !cls.trim()) { setError('Pick or type the class this list is for.'); return; }
    if (!org || !inputs.length) return;
    setChecking(true); setError(null);
    try { setMatches(await matchStudents(org, inputs)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t check the list — try again.'); }
    finally { setChecking(false); }
  }

  async function save() {
    if (!org || !plan || busy) return;
    // SL-13: one tick mustn't end a whole school's memberships unnoticed
    const students = members.filter((m) => !m.until && m.role === 'Member' && (m.grades ?? []).some((g) => !g.until)).length;
    if (markLeft && needsLeaverConfirm(plan.leavers.length, students)) {
      const ok = await confirmAction(`Mark ${plan.leavers.length} students as left?`,
        `That’s ${Math.round((plan.leavers.length / Math.max(1, students)) * 100)}% of your students. If this list is only part of the school, untick it — or use “One class or section”.`,
        `Mark ${plan.leavers.length} as left`, true);
      if (!ok) return;
    }
    setBusy(true); setError(null);
    try {
      const res = await applyStudentList(org, plan, inputs, { today: todayIn(), markLeft });
      setDone(res);
      const parts = [
        res.created && `${res.created} added`, res.moved && `${res.moved} moved class`, res.rejoined && `${res.rejoined} back`,
        res.updated && `${res.updated} updated`, res.left && `${res.left} marked as left`, res.asked && `${res.asked} parent${res.asked === 1 ? '' : 's'} asked`,
      ].filter(Boolean).join(' · ');
      notice('Student list saved', parts || 'Nothing needed changing.');
      setText(''); setFileNote(null); setMatches(null); setMarkLeft(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Saving stopped part-way — check the Members tab, then try again.');
    } finally { setBusy(false); }
  }

  if (loading) return <SafeAreaView style={st.safe}><LoadingState /></SafeAreaView>;
  if (!org) return <SafeAreaView style={st.safe}><FormError message={error ?? 'School not found.'} /></SafeAreaView>;

  const nameOf = (pid: string) => players.get(pid)?.fullName ?? 'Student';
  const otherOrder: DateOrder = parsed?.dateOrder === 'MDY' ? 'DMY' : 'MDY';
  const doing = plan ? plan.counts.new + plan.counts.move + plan.counts.update + plan.counts.rejoin + plan.counts.parent + (markLeft ? plan.leavers.length : 0) : 0;
  const unresolved = plan?.counts.check ?? 0;
  const describe = (p: PlannedStudent): string => {
    const r = p.row;
    const bits = [
      p.action === 'move' ? `${p.fromStandard ?? 'no class'} → ${p.standard}` : p.standard,
      p.house ? `${p.house} House${p.fromHouse && p.fromHouse !== p.house && p.action !== 'new' ? ` (was ${p.fromHouse})` : ''}` : '',
      r.dob ? `${spelledDate(r.dob)}${ageOn(r.dob) < 18 ? '' : ' · adult'}` : '',
      p.admissionNo ? `Adm. ${p.admissionNo}` : '',
    ];
    return bits.filter(Boolean).join(' · ');
  };

  return (
    <SafeAreaView style={st.safe} edges={['bottom']}>
      <KeyboardFooterLayout
        safeBottom={false}
        footer={(
          <>
            <FormError message={error} />
            {done ? (
              <Text style={textStyles.muted}>
                ✅ Saved.{done.failed.length ? ` Couldn’t add: ${done.failed.join(', ')}.` : ''}{done.admissionTaken.length ? ` These admission numbers belong to another student: ${done.admissionTaken.join(', ')}.` : ''}{done.parentError ? ` ${done.parentError}` : done.asked ? ` ${done.emailed} parent email${done.emailed === 1 ? '' : 's'} sent.` : ''}
              </Text>
            ) : null}
            {!plan ? (
              <Button label={checking ? 'Checking…' : `🔎 Check ${inputs.length || ''} student${inputs.length === 1 ? '' : 's'}`.replace('  ', ' ')} disabled={checking || !inputs.length} onPress={() => void check()} />
            ) : (
              <Button label={busy ? 'Saving…' : doing ? `Save the list (${doing} change${doing === 1 ? '' : 's'})` : 'Nothing to change'} disabled={busy || !doing} onPress={() => void save()} />
            )}
            {done ? <Button label="Done" variant="ghost" onPress={() => nav.goBack()} /> : null}
          </>
        )}
      >
        <KeyboardAwareScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
          <ScreenTitle title="📥 Add students" subtitle={org.name} />

          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>1. Which students?</Text>
            <View style={st.chips}>
              <SelectChip label="🏫 Whole school" active={scopeKind === 'school'} onPress={() => setScopeKind('school')} />
              <SelectChip label="📚 One class or section" active={scopeKind === 'class'} onPress={() => setScopeKind('class')} />
            </View>
            {scopeKind === 'school' ? (
              <Text style={textStyles.muted}>Each row’s class and section come from the list’s Class and Section columns (“7-B” in one column works too). New students across every class, all at once.</Text>
            ) : (
              <>
                {classes.length ? (
                  <View style={st.chips}>
                    {classes.map((c) => <SelectChip key={c} label={c} active={cls === c} onPress={() => { setCls(c); setSection(''); }} />)}
                  </View>
                ) : null}
                <TextField label="Class" value={cls} onChange={(v) => { setCls(v); }} placeholder="e.g. Class 7" />
                {cls && sectionsOf(cls).length ? (
                  <View style={st.chips}>
                    <SelectChip label="All sections" active={!section} onPress={() => setSection('')} />
                    {sectionsOf(cls).map((s) => <SelectChip key={s} label={`Section ${s}`} active={section === s} onPress={() => setSection(s)} />)}
                  </View>
                ) : null}
                <TextField label="Section (optional)" value={section} onChange={setSection} placeholder="e.g. B" autoCapitalize="characters" />
                <Text style={textStyles.muted}>Every row goes into {cls.trim() ? `${cls.trim()}${section.trim() ? `-${section.trim().toUpperCase()}` : ''}` : 'this class'}, unless the row has its own Section. Names and dates of birth are enough.</Text>
              </>
            )}
          </Card>

          <Card style={{ gap: theme.spacing(2) }}>
            <Text style={textStyles.h3}>2. The list</Text>
            <Text style={textStyles.muted}>
              From your school system or a spreadsheet. Columns, any order: Admission no, Name (or First name + Last name), Date of birth, Gender{scopeKind === 'school' ? ', Class, Section' : ''}, House, Guardian name, Guardian email, Guardian phone. Dates are {dateOrderWords(region.dateOrder)}.
            </Text>
            <View style={st.chips}>
              {Platform.OS === 'web' ? <Button label="📂 Choose a CSV or Excel file" variant="ghost" onPress={() => void chooseFile()} /> : null}
              <Button label="⬇ Template" variant="ghost" onPress={() => downloadText(scopeKind === 'school' ? 'students-template.csv' : 'class-template.csv', 'text/csv', STUDENT_TEMPLATE(region.dateOrder, scopeKind))} />
            </View>
            {fileNote ? <Text style={textStyles.muted}>{fileNote}</Text> : null}
            <TextField label={Platform.OS === 'web' ? '…or paste the rows (with the header row)' : 'Paste the rows (with the header row)'} value={text} onChange={(v) => { setText(v); setFileNote(null); setDone(null); }} multiline
              placeholder={STUDENT_TEMPLATE(region.dateOrder, scopeKind).trim()} autoCapitalize="none" />
            <IconText label={"🔒 Admission numbers and parents’ contacts stay private to the school’s admins. A child never gets their own contact details from a list."} style={textStyles.muted} />
          </Card>

          {parsed?.missingName ? <IconText label={"⚠ No Name column found — add a header row with “Name” (or “First name” and “Last name”)."} style={st.warn} /> : null}
          {parsed?.ambiguousDates ? (
            <Card style={{ gap: theme.spacing(1) }}>
              <IconText label={"⚠ Every date fits both ways — is 04/05/2012 the 4th of May or April 5th?"} style={st.warn} />
              <View style={st.chips}>
                <SelectChip label="Day first (4 May)" active={(forceOrder ?? parsed.dateOrder) === 'DMY'} onPress={() => setForceOrder('DMY')} />
                <SelectChip label="Month first (April 5)" active={(forceOrder ?? parsed.dateOrder) === 'MDY'} onPress={() => setForceOrder('MDY')} />
              </View>
            </Card>
          ) : parsed?.orderFromFile ? <Text style={textStyles.muted}>Dates read {dateOrderWords(parsed.orderFromFile)} (the file says so). <Text style={st.link} onPress={() => setForceOrder(otherOrder)}>Read them {dateOrderWords(otherOrder)}</Text></Text> : null}
          {rows.length && !plan ? <Text style={textStyles.muted}>{rows.length} row{rows.length === 1 ? '' : 's'} read{rows.some((r) => r.errors.length) ? ` · ${rows.filter((r) => r.errors.length).length} can’t be read` : ''}. Tap “Check” to see who’s new, who’s already here and who moves class.</Text> : null}

          {plan ? (
            <>
              <Card style={{ gap: theme.spacing(1) }}>
                <Text style={textStyles.h3}>3. What happens</Text>
                <Text style={textStyles.body}>
                  {[
                    plan.counts.new && `${plan.counts.new} new`, plan.counts.move && `${plan.counts.move} move class`, plan.counts.rejoin && `${plan.counts.rejoin} back`,
                    plan.counts.update && `${plan.counts.update} updated`, plan.counts.same && `${plan.counts.same} unchanged`,
                    plan.counts.parent && `${plan.counts.parent} parent${plan.counts.parent === 1 ? '' : 's'} asked`, plan.counts.check && `${plan.counts.check} need${plan.counts.check === 1 ? 's' : ''} a look`,
                    plan.counts.skip && `${plan.counts.skip} not added`,
                  ].filter(Boolean).join(' · ')}
                </Text>
                {unresolved ? <Text style={st.warn}>⚠ {unresolved === 1 ? '1 row needs a look below — it’s left out until you choose.' : `${unresolved} rows need a look below — they’re left out until you choose.`}</Text> : null}
              </Card>

              {GROUPS.filter((g) => plan.counts[g.action]).map((g) => {
                const list = plan.rows.filter((p) => p.action === g.action);
                const isOpen = !!open[g.action];
                return (
                  <Card key={g.action} style={{ gap: theme.spacing(1) }}>
                    <Text style={[textStyles.h3, st.link]} accessibilityRole="button" onPress={() => setOpen((o) => ({ ...o, [g.action]: !isOpen }))}>
                      {g.title} ({list.length}) {isOpen ? '▾' : '▸'}
                    </Text>
                    {isOpen ? list.slice(0, SHOW).map((p) => (
                      <View key={p.row.line} style={st.row}>
                        <Text style={[textStyles.body, st.bold]} numberOfLines={1}>{p.row.line}. {p.row.fullName || '—'}</Text>
                        <Text style={textStyles.muted} numberOfLines={2}>{describe(p)}</Text>
                        {p.note ? <Text style={g.action === 'check' || g.action === 'skip' ? st.warn : textStyles.muted}>{p.note}</Text> : null}
                        {g.action === 'check' || choices[p.row.line] ? (
                          <View style={st.chips}>
                            {p.canBeSame || choices[p.row.line] === 'same' ? <SelectChip label={`Same student${p.playerId ? ` (${nameOf(p.playerId)})` : ''}`} active={choices[p.row.line] === 'same'} onPress={() => setChoices((c) => ({ ...c, [p.row.line]: 'same' }))} /> : null}
                            <SelectChip label="New student" active={choices[p.row.line] === 'new'} onPress={() => setChoices((c) => ({ ...c, [p.row.line]: 'new' }))} />
                            <SelectChip label="Skip" active={choices[p.row.line] === 'skip'} onPress={() => setChoices((c) => ({ ...c, [p.row.line]: 'skip' }))} />
                          </View>
                        ) : null}
                      </View>
                    )) : null}
                    {isOpen && list.length > SHOW ? <Text style={textStyles.muted}>…and {list.length - SHOW} more.</Text> : null}
                  </Card>
                );
              })}

              {plan.leavers.length ? (
                <Card style={{ gap: theme.spacing(1) }}>
                  <Text style={textStyles.h3}>🚪 Not on this list ({plan.leavers.length})</Text>
                  <Text style={textStyles.muted}>Current students with a class who aren’t on the list. If they’ve left the school, mark them as left: they stay in past results and teams, and come back with their history if they return.</Text>
                  {plan.leavers.slice(0, SHOW).map((l) => (
                    <Text key={l.playerId} style={textStyles.body} numberOfLines={1}>{nameOf(l.playerId)}{l.standard ? <Text style={textStyles.muted}>  {l.standard}</Text> : null}</Text>
                  ))}
                  {plan.leavers.length > SHOW ? <Text style={textStyles.muted}>…and {plan.leavers.length - SHOW} more.</Text> : null}
                  <SelectChip label={`${markLeft ? '✓ ' : ''}${plan.leavers.length === 1 ? 'Mark this student as left today' : `Mark these ${plan.leavers.length} as left today`}`} active={markLeft} onPress={() => setMarkLeft(!markLeft)} />
                </Card>
              ) : null}
            </>
          ) : null}
        </KeyboardAwareScrollView>
      </KeyboardFooterLayout>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(1.5) },
  row: { gap: 2, paddingVertical: theme.spacing(1), borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  bold: { fontWeight: '700' },
  warn: { color: theme.colors.accent, fontSize: theme.font.small },
  link: { color: theme.colors.primary, fontWeight: '700' },
});
