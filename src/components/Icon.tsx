/**
 * 2026-10-29 redesign — the line icons (lucide) that stand in for a label's
 * leading emoji in the shared components (Button, SelectChip, EmptyState…).
 * One map, so the same emoji is the same icon everywhere. Emoji with no good
 * line equivalent (a sport's ball in a scoring pad, medals) aren't listed and
 * stay as they are. Named imports only: the icon set is tree-shaken.
 */
import React from 'react';
import { Text, View, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import {
  ArrowLeft, ArrowLeftRight, ArrowUpRight, Award, Ban, Bandage, Bell, BookOpen, Bot, BrickWall, Building, CalendarDays, Camera,
  ChartColumn, Check, CircleCheck, CircleQuestionMark, CircleX, ClipboardList, Clock, Contact, Crown, Delete, Download,
  Droplet, Eye, FileText, Flag, FlaskConical, Flame, FolderOpen, Footprints, Funnel, Gavel, Globe, Goal, Hand, Handshake,
  Hourglass, House, IdCard, Inbox, Info, Landmark, Link, ListOrdered, Lock, LockKeyhole, LogOut, Mail, MapPin, Medal, Megaphone,
  MessageCircle, Mic, NotebookPen, OctagonX, Pause, Pencil, Phone, Play, Plus, Printer, QrCode, Radio, RectangleVertical, RefreshCw,
  Repeat, Save, Scale, School, Search, Send, Settings, Share, Shield, Shirt, Shuffle, Siren, SkipForward,
  SlidersHorizontal, Smartphone, Sparkles, Star, Stethoscope, Target, Ticket, Timer, Trash, Trees, TrendingUp, TriangleAlert, Trophy,
  Tv, Undo2, Upload, UserPlus, UserRound, Users, Video, X, Zap, Vibrate, Compass, Headset, UsersRound, Rewind, Puzzle, Swords,
  LandPlot, FlagOff, FlagTriangleRight, ChevronsRight, HandGrab, Scissors, ChevronsUp, ChevronsDown, CircleOff, Columns2, CircleDot,
  CircleSlash, RotateCcw, RotateCw, Gift, LogIn, ShieldHalf, Ruler, HandHelping,
} from 'lucide-react-native';
import { theme } from '../core/theme';
import { splitLeading, iconBox } from '../core/leadingEmoji';

type LucideComp = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number; fill?: string }>;
export interface EmojiIconSpec {
  Icon: LucideComp;
  /** a fixed colour (a yellow card stays yellow); else the text colour */
  color?: string;
  fill?: string;
  /** the spoken name when the label is the icon alone ("✕" → "Close") */
  name?: string;
}

const card = (c: string): EmojiIconSpec => ({ Icon: RectangleVertical, color: c, fill: c });

export const EMOJI_ICONS: Record<string, EmojiIconSpec> = {
  // marks
  '✓': { Icon: Check, name: 'Done' }, '✔': { Icon: Check, name: 'Done' }, '✅': { Icon: CircleCheck, name: 'Done' }, '☑': { Icon: CircleCheck },
  '✗': { Icon: X, name: 'No' }, '✕': { Icon: X, name: 'Close' }, '❌': { Icon: CircleX, name: 'No' }, '⛔': { Icon: OctagonX }, '🚫': { Icon: Ban },
  '⚠': { Icon: TriangleAlert }, 'ℹ': { Icon: Info }, '★': { Icon: Star }, '⭐': { Icon: Star }, '✨': { Icon: Sparkles }, '🆕': { Icon: Sparkles },
  '❓': { Icon: CircleQuestionMark },
  // play and time
  '▶': { Icon: Play, name: 'Start' }, '⏸': { Icon: Pause, name: 'Pause' }, '⏭': { Icon: SkipForward }, '⏱': { Icon: Timer }, '⏲': { Icon: Timer },
  '⏳': { Icon: Hourglass }, '🕒': { Icon: Clock }, '🔁': { Icon: Repeat }, '🔄': { Icon: RefreshCw }, '🔀': { Icon: Shuffle }, '⇄': { Icon: ArrowLeftRight },
  '↩': { Icon: Undo2, name: 'Undo' }, '↶': { Icon: Undo2, name: 'Undo' }, '⌫': { Icon: Delete }, '↗': { Icon: ArrowUpRight }, '←': { Icon: ArrowLeft, name: 'Back' },
  // match officials and cards
  '🟨': card('#E7B416'), '🟥': card('#C62828'), '🟩': card('#2E9D4F'), '🟦': card('#1D56C9'), '🏁': { Icon: Flag }, '🚩': { Icon: FlagTriangleRight }, '🏳': { Icon: FlagOff },
  '⚖': { Icon: Scale }, '🎯': { Icon: Target }, '🛡': { Icon: Shield }, '🧤': { Icon: Hand }, '✋': { Icon: Hand }, '🖐': { Icon: Hand }, '🥅': { Icon: Goal },
  '🩸': { Icon: Droplet }, '🩺': { Icon: Stethoscope }, '🩹': { Icon: Bandage }, '🚨': { Icon: Siren }, '🔥': { Icon: Flame }, '📺': { Icon: Tv },
  '🦶': { Icon: Footprints }, '🧱': { Icon: BrickWall }, '👔': { Icon: Shirt }, '⚡': { Icon: Zap }, '🔗': { Icon: Link }, '📝': { Icon: NotebookPen },
  // things
  '🏆': { Icon: Trophy }, '🏅': { Icon: Medal }, '🎖': { Icon: Award }, '👑': { Icon: Crown }, '📋': { Icon: ClipboardList }, '📊': { Icon: ChartColumn },
  '📈': { Icon: TrendingUp }, '🔢': { Icon: ListOrdered }, '🗑': { Icon: Trash, name: 'Delete' }, '⚙': { Icon: Settings, name: 'Settings' },
  '🔧': { Icon: SlidersHorizontal }, '👥': { Icon: Users }, '👤': { Icon: UserRound }, '🙋': { Icon: UserRound }, '➕': { Icon: Plus }, '🤝': { Icon: Handshake },
  '📂': { Icon: FolderOpen }, '📄': { Icon: FileText }, '📖': { Icon: BookOpen }, '🖨': { Icon: Printer }, '📇': { Icon: Contact }, '🪪': { Icon: IdCard },
  '📅': { Icon: CalendarDays }, '🗓': { Icon: CalendarDays }, '📆': { Icon: CalendarDays }, '📍': { Icon: MapPin }, '🏛': { Icon: Landmark },
  '🏫': { Icon: School }, '🏢': { Icon: Building }, '🌐': { Icon: Globe }, '🌳': { Icon: Trees }, '🏠': { Icon: House }, '🎟': { Icon: Ticket },
  '🔒': { Icon: Lock }, '🔐': { Icon: LockKeyhole }, '🔎': { Icon: Search, name: 'Search' }, '🔍': { Icon: Search, name: 'Search' },
  '🧪': { Icon: FlaskConical }, '💾': { Icon: Save }, '📥': { Icon: Download }, '📤': { Icon: Share, name: 'Share' }, '⬆': { Icon: Upload }, '⬇': { Icon: Download },
  '🔔': { Icon: Bell }, '👀': { Icon: Eye }, '📣': { Icon: Megaphone }, '📡': { Icon: Radio }, '🎥': { Icon: Video }, '📹': { Icon: Video },
  '🤖': { Icon: Bot }, '⚒': { Icon: Gavel }, '🔨': { Icon: Gavel }, '📨': { Icon: Inbox }, '🚪': { Icon: LogOut },
  // talking to people
  '✉': { Icon: Mail }, '💌': { Icon: Mail }, '📧': { Icon: Mail }, '💬': { Icon: MessageCircle }, '📞': { Icon: Phone }, '📱': { Icon: Smartphone }, '📲': { Icon: Smartphone },
  '📷': { Icon: Camera }, '📸': { Icon: Camera }, '🎙': { Icon: Mic }, '✎': { Icon: Pencil, name: 'Edit' }, '✏': { Icon: Pencil, name: 'Edit' },
  '➤': { Icon: Send }, '🎤': { Icon: Mic }, '⛳': { Icon: LandPlot }, '🏃': { Icon: ChevronsRight }, '🟫': { Icon: Ban }, '🤾': { Icon: HandGrab },
  '⏪': { Icon: Rewind }, '🌍': { Icon: Globe }, '🌎': { Icon: Globe }, '🌏': { Icon: Globe }, '📳': { Icon: Vibrate }, '🧭': { Icon: Compass },
  '👪': { Icon: UsersRound }, '👨‍👩‍👧': { Icon: UsersRound }, '👨‍👩‍👦': { Icon: UsersRound }, '🧑‍💼': { Icon: Headset }, '👨‍💼': { Icon: Headset }, '🔳': { Icon: QrCode }, '👋': { Icon: UserPlus }, '🔽': { Icon: Funnel },
  '🧩': { Icon: Puzzle }, '⚔': { Icon: Swords },
  // scoring actions that must not share an icon with their neighbours (tests/pad-icons.test.mts)
  '✂': { Icon: Scissors }, '⏫': { Icon: ChevronsUp }, '⏬': { Icon: ChevronsDown }, '💨': { Icon: CircleOff }, '🪵': { Icon: Columns2 },
  '⭕': { Icon: CircleDot }, '❎': { Icon: CircleSlash }, '🔃': { Icon: RotateCcw }, '♻': { Icon: RotateCcw }, '🔂': { Icon: RotateCw },
  '🎁': { Icon: Gift }, '🔙': { Icon: LogIn }, '🔰': { Icon: ShieldHalf }, '🚶': { Icon: LogOut }, '📏': { Icon: Ruler }, '👐': { Icon: HandHelping },
};

/** The emoji the components look for, longest first. */
export const EMOJI_KEYS: readonly string[] = Object.keys(EMOJI_ICONS).map((k) => k.trim()).sort((a, b) => b.length - a.length);

/** An emoji's icon at a size, in `color` unless the icon has its own. */
/** Reference-video B8: one thin line weight for every converted icon. */
export const ICON_STROKE = 1.75;

export function EmojiIcon({ spec, color, size = 18 }: { spec: EmojiIconSpec; color: string; size?: number }) {
  const { Icon } = spec;
  return <Icon color={spec.color ?? color} fill={spec.fill ?? 'none'} size={size} strokeWidth={ICON_STROKE} />;
}

/** An icon slot that used to hold an emoji: its line icon when it has one —
 *  sized from the slot's fontSize, in the slot's colour, keeping the slot's
 *  layout (margins, size, a round button's padding and fill) — else the emoji. */
export function Glyph({ emoji, style, color }: { emoji: string; style?: StyleProp<TextStyle>; color?: string }) {
  const spec = typeof emoji === 'string' ? EMOJI_ICONS[emoji.replace(/\uFE0F/g, '')] : undefined;
  if (!spec) return <Text style={style}>{emoji}</Text>;
  const { box, size, color: ink } = iconBox(StyleSheet.flatten(style) as Record<string, unknown> | undefined, theme.colors.text, color);
  return (
    <View style={[{ minWidth: size + 2, alignItems: 'center', justifyContent: 'center' }, box as ViewStyle]}
      accessible={false} importantForAccessibility="no">
      <EmojiIcon spec={spec} color={ink} size={size} />
    </View>
  );
}

/** A label that starts with an emoji ("▶ Start scoring", "⚠ No Name column…"):
 *  the emoji as a line icon in the text's colour, lined up with the first line,
 *  then the words. The style's layout (margins, flex, a pill's fill) moves to
 *  the row; centred text stays centred. Plain text when the emoji isn't mapped. */
export function IconText({ label, style, numberOfLines }: { label: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const lead = splitLeading(label, EMOJI_KEYS);
  const spec = lead && lead.rest ? EMOJI_ICONS[lead.key] : undefined;
  if (!lead || !spec) return <Text style={style} numberOfLines={numberOfLines}>{label}</Text>;
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const { box, text, color } = iconBox(flat, theme.colors.text);
  const fontSize = Number(flat.fontSize ?? 14);
  const lineH = Number(flat.lineHeight ?? Math.round(fontSize * 1.35));
  return (
    <View style={[st.iconText, flat.textAlign === 'center' && st.centred, box as ViewStyle]}>
      <View style={{ height: lineH, justifyContent: 'center' }}>
        <EmojiIcon spec={spec} color={color} size={Math.round(fontSize * 1.1)} />
      </View>
      <Text style={[text as TextStyle, st.words]} numberOfLines={numberOfLines}>{lead.rest}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  iconText: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  centred: { justifyContent: 'center' },
  words: { flexShrink: 1 },
});
