/** Data-driven player profile, shared by the Profile tab and PlayerProfile
 *  screen. Stays concise: header, follow, overall stats, and a tappable
 *  per-sport list. Deep per-sport stats/details live on SportProfileScreen. */
import { isEventSport } from '../sports/eventSports';
import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '../core/theme';
import { Glyph } from './Icon';
import { SportBadge } from './SportSymbol';
import { verificationSummary } from '../core/verificationReview';
import { useVerificationUpload } from '../data/useVerificationUpload';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { Card, Pill, Button, SelectChip, EmptyState, LoadingState, textStyles, plural } from './ui';
import { profileViewState } from '../data/profileViewState';
import { SectionHeader, SECTION_CAP } from './SectionHeader';
import { ContactCard } from './ContactCard';
import { inviteGuardianToLink } from '../data/messages';
import { isSupabaseConfigured } from '../core/supabase';
import { usePlayerProfile, useOrganizations } from '../data/hooks';
import { updatePlayer, uploadImage, verifyGuardianContact, getPendingVerifications, SUPPORT_EMAIL } from '../data/repos';
import { pickImage } from '../core/photo';
import { ageFromDob, ageOf } from '../core/age';
import { useVerificationReviewer } from '../data/useVerificationReviewer';
import { VerificationChecklist } from './VerificationChecklist';
import { MyCertificatesCard } from './MyCertificatesCard';
import { CareerPassportCard } from './CareerPassportCard';
import { useAuth } from '../core/auth';
import { isSupport } from '../core/roles';
import { activeOrgsForPlayer, pastOrgsForPlayer, roleInOrg, memberEntry, membershipPeriod, isAcademicCommunity, currentStandard } from '../core/org';
import { teamsByRecency, teamPeriod, type TeamAffiliation } from '../core/teams';
import { getSportMeta } from '../sports/sportMeta';
import { sportSummary, hasPartialCoverage, recordText } from '../data/stats';
import { profileHeadline } from '../data/profileHeadline';
import type { Player, SportId } from '../core/types';
import { useImageUri } from '../data/useImageUri';
import { avatarInitials, canFollowCard, isReducedCard, reducedCardNote } from '../core/minorPrivacy';
import { notice } from '../core/confirm';
import { FollowBell } from './FollowBell';
import { PairsSection, FollowingSection } from './PairsAndFollowing';

export function ProfileView({
  playerId,
  lookupFailed,
  onRetryLookup,
  follow,
  onShare,
  publicHidden,
  onMessage,
  onOpenSport,
  onEditProfile,
  onAdminEdit,
  onOpenOrg,
  onOpenSettings,
  onOpenVerificationReview,
  onCreateProfile,
  creating,
  onSignOut,
  mine,
}: {
  /** undefined = the owner's player is still being looked up */
  playerId: string | null | undefined;
  /** own profile: looking up the account's player failed */
  lookupFailed?: boolean;
  onRetryLookup?: () => void;
  /** `name` labels the 🔔 alert-settings sheet (falls back to the player's name). */
  follow?: { following: boolean; onToggle: () => void; name?: string };
  /** Share this profile (record across sports + link). */
  onShare?: () => void;
  /** CL-03: an under-18 whose parent isn't approved yet — no career passport to share */
  publicHidden?: boolean;
  /** someone else's profile: open a conversation (routed to the guardian for under-18s) */
  onMessage?: () => void;
  /** open the dedicated per-sport profile page */
  onOpenSport?: (sport: SportId) => void;
  /** own profile: edit your own details */
  onEditProfile?: () => void;
  /** someone else's UNCLAIMED player I manage (parity #12): fix their details.
   *  Not onEditProfile — that one means "my own profile". */
  onAdminEdit?: () => void;
  /** open an organization the player belongs to */
  onOpenOrg?: (orgId: string) => void;
  /** own profile: open the Settings home (preferences, account, sign out) */
  onOpenSettings?: () => void;
  /** own profile + support role: open the verification review queue */
  onOpenVerificationReview?: () => void;
  /** own profile with no player yet: create it (first-time setup) */
  onCreateProfile?: () => void;
  /** true while the player profile is being created */
  creating?: boolean;
  /** own profile: sign out of the account */
  onSignOut?: () => void;
  /** own profile: the "Mine" card — rendered under Edit profile */
  mine?: React.ReactNode;
}) {
  const { player, stats: allStats, official, friendly, status, retry } = usePlayerProfile(playerId);
  const orgs = useOrganizations();
  const { profile: viewer } = useAuth();
  const ownProfile = !!onEditProfile;
  const viewerIsSupport = isSupport(viewer?.role);
  // Support + appointed reviewers (docs/verification/fast-lanes.md)
  const viewerIsReviewer = useVerificationReviewer() === true;
  // Support reviewers get a "pending approvals" entry on their own profile, so the
  // queue is reachable without hunting through notifications.
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  useEffect(() => {
    if (!(ownProfile && viewerIsReviewer)) return;
    let on = true;
    getPendingVerifications().then((list) => on && setPendingCount(list.length));
    return () => { on = false; };
  }, [ownProfile, viewerIsReviewer]);
  const [scope, setScope] = useState<'all' | 'official' | 'friendly'>('all');
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  // Inline "See all" toggles — each record-list section shows 5, then expands.
  const [showSports, setShowSports] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
  const [showComm, setShowComm] = useState(false);
  const [showPastComm, setShowPastComm] = useState(false);
  useEffect(() => setPhoto(player?.photoUrl), [player?.photoUrl]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const changePhoto = async () => {
    if (!player) return;
    const img = await pickImage({ aspect: [1, 1] });
    if (!img) return;
    const before = photo;
    setPhoto(img.uri); // preview while it uploads
    setPhotoBusy(true);
    try {
      const url = await uploadImage(img, 'player-photo');
      await updatePlayer(player.id, { photoUrl: url });
      setPhoto(url);
    } catch (e) {
      setPhoto(before);
      notice('Couldn’t save the photo', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };
  // A private player photo is signed per viewer (protect_minors); refused → initials.
  const shownPhoto = useImageUri(photo, !isSupabaseConfigured || photoBusy);

  // 2026-10-29: "Set up your profile" only when the account has no player
  // profile — not while it loads, nor when a read failed
  const view = profileViewState({
    playerId, status: lookupFailed ? 'failed' : status, hasPlayer: !!player, hasStats: !!(allStats && official && friendly),
  });
  if (view === 'loading') return <LoadingState label="Loading the profile…" />;
  if (view !== 'show' || !player || !allStats || !official || !friendly) {
    // Own account with no player yet (a fresh sign-up): make this actionable —
    // set up the profile, reach Settings, or sign out — instead of a dead-end.
    // Viewing someone else with no profile just shows the neutral empty state.
    const owner = !!(onCreateProfile || onSignOut);
    // own profile: the account has a player id, so no profile back is a failed read
    const failed = view === 'failed' || (view === 'missing' && owner);
    return (
      <ScrollView contentContainerStyle={st.content}>
        <View style={st.emptyBlock}>
          <EmptyState
            icon={failed ? '📡' : '🙋'}
            title={failed ? 'Couldn’t load the profile' : owner ? 'Set up your profile' : 'No player profile found'}
            hint={failed
              ? 'Check your connection, then try again. Nothing has been lost.'
              : owner
                ? 'Add your name, contact, location and the sports you play — so teams and organizers can find you.'
                : 'This account doesn’t have a player profile yet.'}
          />
          {failed && <Button label="Try again" onPress={() => { if (lookupFailed) onRetryLookup?.(); else retry(); }} />}
          {!failed && onCreateProfile && (
            <Button label={creating ? 'Setting up…' : '✎ Set up your profile'} onPress={onCreateProfile} disabled={creating} />
          )}
          {/* A support / reviewer account often has no player profile — keep
              the approvals queue reachable from here too. */}
          {owner && viewerIsReviewer && onOpenVerificationReview && (
            <Button label="🛡️ Review verifications" variant="ghost" onPress={onOpenVerificationReview} />
          )}
          {owner && onOpenSettings && <Button label="⚙  Settings" variant="ghost" onPress={onOpenSettings} />}
          {onSignOut && <Button label="Sign out" variant="ghost" onPress={onSignOut} />}
        </View>
      </ScrollView>
    );
  }

  // Stats reflect the chosen scope. The toggle shows for anyone who has played
  // (consistent placement); an empty scope just says so.
  const hasSplit = allStats.matches > 0;
  const stats = !hasSplit ? allStats : scope === 'official' ? official : scope === 'friendly' ? friendly : allStats;
  const emptyScope = hasSplit && stats.matches === 0
    ? scope === 'friendly' ? 'No friendlies played yet.' : 'No official (tournament) matches yet.'
    : null;

  const initials = avatarInitials(player.fullName);
  const reduced = !ownProfile && isReducedCard(player);
  const followAllowed = canFollowCard(player, { signedIn: !!viewer, isSelf: ownProfile || player.profileId === viewer?.id });
  const details = player.sportDetails ?? {};

  return (
    <ScrollView contentContainerStyle={st.content}>
      {/* 2026-10-29 redesign: the player card — pitch green, lime ring */}
      <View style={st.heroCard}>
      <Svg style={st.heroArt} width={160} height={160} viewBox="0 0 100 100" pointerEvents="none">
        <Circle cx={60} cy={40} r={34} fill={theme.colors.lime} opacity={0.85} />
      </Svg>
      <View style={st.headerRow}>
        <TouchableOpacity accessibilityRole="button" activeOpacity={onEditProfile ? 0.8 : 1} disabled={!onEditProfile} onPress={changePhoto}>
          <View style={st.avatar}>
            {shownPhoto ? (
              <Image source={{ uri: shownPhoto }} style={[st.avatarImg, photoBusy && { opacity: 0.4 }]} />
            ) : (
              <Text style={st.avatarText}>{initials}</Text>
            )}
          </View>
          {onEditProfile && (
            <View style={st.camBadge}><Glyph emoji="📷" style={st.camIcon} color={theme.colors.text} /></View>
          )}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.heroName}>
            {player.fullName}
            {player.verification?.status === 'approved' || player.ageVerifiedBy ? <Text style={st.verifiedTick} accessibilityLabel="Age verified">  ☑️</Text> : null}
          </Text>
          <Text style={st.heroMeta}>
            {player.houseName ?? 'Independent'}
            {ageOf(player) !== undefined ? ` · ${ageOf(player)} yrs` : ''}
            {player.gender ? ` · ${player.gender}` : ''}
            {player.city ? ` · ${player.city}` : ''}
            {player.jerseyNo ? ` · #${player.jerseyNo}` : ''}
          </Text>
          <View style={st.tagRow}>
            {player.sports.map((s) => (
              <Pill key={s} label={`${getSportMeta(s).icon} ${getSportMeta(s).name}`} color="rgba(255,255,255,0.12)" textColor={theme.colors.heroText} />
            ))}
          </View>
        </View>
      </View>
      </View>

      {player.bio ? (
        <Card><Text style={textStyles.body}>{player.bio}</Text></Card>
      ) : null}

      {onEditProfile && (
        <Button label="✎ Edit profile" variant="ghost" onPress={onEditProfile} />
      )}
      {!onEditProfile && onAdminEdit && (
        <Button label="✎ Edit player details" variant="ghost" onPress={onAdminEdit} />
      )}
      {onShare && <Button label={ownProfile ? '📤 Share my profile' : '📤 Share profile'} variant="ghost" onPress={onShare} />}
      {reduced && (
        <Card><Text style={textStyles.muted}>🔒 {reducedCardNote(player, !viewer)}</Text></Card>
      )}
      {follow && (followAllowed || follow.following) && (
        <View style={st.followRow}>
          <Button
            label={follow.following ? '✓ Following' : '+ Follow player'}
            variant={follow.following ? 'ghost' : 'primary'}
            onPress={follow.onToggle}
            style={{ flex: 1 }}
          />
          {follow.following && playerId && (
            <FollowBell type="player" id={playerId} name={follow.name ?? player?.fullName ?? 'this player'} />
          )}
        </View>
      )}
      {onMessage && !ownProfile && (
        <Button
          label={(ageOf(player) ?? 0) >= 18 ? '💬 Message' : '💬 Message their parent/guardian'}
          variant="ghost"
          onPress={onMessage}
        />
      )}

      {hasSplit && (
        <View style={st.tagRow}>
          <SelectChip label={`All · ${allStats.matches}`} active={scope === 'all'} onPress={() => setScope('all')} />
          <SelectChip label={`Official · ${official.matches}`} active={scope === 'official'} onPress={() => setScope('official')} />
          <SelectChip label={`Friendly · ${friendly.matches}`} active={scope === 'friendly'} onPress={() => setScope('friendly')} />
        </View>
      )}

      {/* The three headline boxes are sport-neutral so they're fair across every
          sport (and for players who only play friendlies). */}
      {emptyScope ? (
        <Card><Text style={textStyles.muted}>{emptyScope}</Text></Card>
      ) : (
        // SD-131: sport-aware — an athlete reads Events · Finals · Medals · PBs,
        // a stroke-play golfer Rounds · Wins · Best round, everyone else Apps · W-D-L · Win %
        (() => {
          const tiles = profileHeadline(stats.recent);
          return (
            <View style={st.statGrid}>
              {tiles.map((t) => <Stat key={t.label} value={t.value} label={t.label} narrow={tiles.length > 3} />)}
            </View>
          );
        })()
      )}

      {stats.bySport.length > 0 && (
      <SectionHeader title="By sport" count={stats.bySport.length} onSeeAll={stats.bySport.length > SECTION_CAP ? () => setShowSports((v) => !v) : undefined} expanded={showSports} />
      )}
      {stats.bySport.length > 0 && (
      <Text style={textStyles.muted}>Tap a sport for full stats &amp; details.</Text>
      )}
      {(showSports ? stats.bySport : stats.bySport.slice(0, SECTION_CAP)).map((b) => {
        const d = details[b.sport as SportId];
        const detailLine = [d?.position, ...(d?.sides ? Object.values(d.sides) : [])].filter(Boolean).join(' · ');
        const summary = sportSummary(b);
        // any surfaced stat tracked in fewer games than played → flag with a cloud
        const partial = hasPartialCoverage(stats.recent, b);
        return (
          <TouchableOpacity accessibilityRole="button" key={b.sport} activeOpacity={0.85} onPress={() => onOpenSport?.(b.sport as SportId)}>
            <Card style={st.sportRow}>
              <SportBadge sport={b.sport} size={32} />
              <View style={{ flex: 1 }}>
                <Text style={textStyles.body}>{getSportMeta(b.sport as SportId).name}</Text>
                {/* SD-90: a measured sport (athletics) has races, not a W-D-L record */}
                {!isEventSport(b.sport) && (
                <Text style={textStyles.muted}>
                  {plural(b.matches, 'match', 'matches')} · {recordText(b)}
                </Text>
                )}
                {summary ? (
                  <Text style={st.summaryLine}>{summary}{partial ? '  ☁' : ''}</Text>
                ) : null}
                {detailLine ? <Text style={st.detailLine}>{detailLine}</Text> : null}
              </View>
              <Text style={st.chevron}>›</Text>
            </Card>
          </TouchableOpacity>
        );
      })}

      {teamsByRecency(player).length > 0 && (
        <>
          <SectionHeader title="Teams" count={teamsByRecency(player).length} onSeeAll={teamsByRecency(player).length > SECTION_CAP ? () => setShowTeams((v) => !v) : undefined} expanded={showTeams} />
          {(showTeams ? teamsByRecency(player) : teamsByRecency(player).slice(0, SECTION_CAP)).map((t) => (
            <TeamRow key={t.name} team={t} />
          ))}
        </>
      )}

      <PairsSection playerId={player.id} />
      {ownProfile ? <FollowingSection /> : null}

      {activeOrgsForPlayer(orgs, player.id).length > 0 && (
        <>
          <SectionHeader title="Communities" count={activeOrgsForPlayer(orgs, player.id).length} onSeeAll={activeOrgsForPlayer(orgs, player.id).length > SECTION_CAP ? () => setShowComm((v) => !v) : undefined} expanded={showComm} />
          {(showComm ? activeOrgsForPlayer(orgs, player.id) : activeOrgsForPlayer(orgs, player.id).slice(0, SECTION_CAP)).map((o) => {
            const m = memberEntry(o, player.id);
            const period = membershipPeriod(m);
            const std = isAcademicCommunity(o.type) ? currentStandard(m) : undefined;
            return (
              <TouchableOpacity accessibilityRole="button" key={o.id} activeOpacity={0.85} onPress={() => onOpenOrg?.(o.id)}>
                <Card style={st.sportRow}>
                  <Glyph emoji="🏛" style={st.sportIcon} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{o.name}</Text>
                    <Text style={textStyles.muted}>
                      {[roleInOrg(o, player.id), o.type, o.city, period, std && `🎓 ${std}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={st.chevron}>›</Text>
                </Card>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {pastOrgsForPlayer(orgs, player.id).length > 0 && (
        <>
          <SectionHeader title="Past communities" count={pastOrgsForPlayer(orgs, player.id).length} onSeeAll={pastOrgsForPlayer(orgs, player.id).length > SECTION_CAP ? () => setShowPastComm((v) => !v) : undefined} expanded={showPastComm} />
          {(showPastComm ? pastOrgsForPlayer(orgs, player.id) : pastOrgsForPlayer(orgs, player.id).slice(0, SECTION_CAP)).map((o) => {
            const m = memberEntry(o, player.id);
            const period = membershipPeriod(m);
            return (
              <TouchableOpacity accessibilityRole="button" key={o.id} activeOpacity={0.85} onPress={() => onOpenOrg?.(o.id)}>
                <Card style={[st.sportRow, { opacity: 0.65 }]}>
                  <Glyph emoji="🏛" style={st.sportIcon} color={theme.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={textStyles.body}>{o.name}</Text>
                    <Text style={textStyles.muted}>
                      {[roleInOrg(o, player.id), o.type, o.city, period].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={st.chevron}>›</Text>
                </Card>
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {/* UI audit step 6: the record (numbers, sports, teams, pairs) first; your links,
          to-dos, documents and contact details after it */}
      {ownProfile && mine}
      {/* Support reviewer's own profile: a discoverable entry to the approvals
          queue (so notifications aren't the only way in). */}
      {ownProfile && viewerIsReviewer && onOpenVerificationReview && (
        <TouchableOpacity accessibilityRole="button" activeOpacity={0.8} onPress={onOpenVerificationReview}>
          <Card style={st.reviewCard}>
            <View style={st.reviewCardRow}>
              <Text style={[textStyles.h3, st.headTitle]}>Review verifications</Text>
              {pendingCount != null && pendingCount > 0 && (
                <Pill label={`${pendingCount} pending`} color={theme.colors.surfaceAlt} textColor={theme.colors.accent} />
              )}
            </View>
            <Text style={textStyles.muted}>
              {pendingCount == null ? 'Age & ID proofs awaiting review.'
                : pendingCount === 0 ? 'No submissions waiting — you’re all caught up.'
                : `${pendingCount} age/ID ${pendingCount === 1 ? 'proof is' : 'proofs are'} waiting. Tap to review — aim for the same day.`}
            </Text>
          </Card>
        </TouchableOpacity>
      )}

      {/* Fast lanes Phase 3: one checklist — what's done and the next step. */}
      {onEditProfile && ownProfile ? <VerificationChecklist player={player} onEditProfile={onEditProfile} /> : null}
      {/* QR-verified certificates: yours (and your children's, as a linked parent) */}
      {ownProfile ? <MyCertificatesCard playerId={player.id} /> : null}
      {/* Career passport: the verified record to share / print */}
      {ownProfile && !publicHidden ? <CareerPassportCard playerId={player.id} /> : null}
      {onEditProfile && (player.phone || player.email) && (
        <ContactCard
          playerId={player.id}
          title={player.showPhone || player.showEmail
            ? `Contact · ${[player.showPhone && 'mobile', player.showEmail && 'email'].filter(Boolean).join(' & ')} shown on your profile`
            : 'Contact · only you can see this'}
          phone={player.phone}
          email={player.email}
          phoneVerified={player.phoneVerified}
          emailVerified={player.emailVerified}
          emailOtp
          phoneOtp
        />
      )}

      {/* Someone else's profile: contact details arrive only when they chose to
          show them (adults) or you run a team they were invited to (migration 0026). */}
      {!onEditProfile && (player.phone || player.email) && (
        <Card style={{ gap: theme.spacing(1) }}>
          <Text style={textStyles.h3}>Contact</Text>
          {player.phone ? <Text style={textStyles.body}>📞 {player.phone}{player.phoneVerified ? '  ✓ verified' : ''}</Text> : null}
          {player.email ? <Text style={textStyles.body}>✉️ {player.email}{player.emailVerified ? '  ✓ verified' : ''}</Text> : null}
        </Card>
      )}

      {/* Parent/guardian — shown to the profile owner (young players whose
          guardian manages the account). Verified the same way as own contact. */}
      {onEditProfile && player.guardian && (
        <ContactCard
          playerId={player.id}
          title="Parent / Guardian · only you can see this"
          name={player.guardian.name}
          phone={player.guardian.phone}
          email={player.guardian.email}
          phoneVerified={player.guardian.phoneVerified}
          emailVerified={player.guardian.emailVerified}
          verify={verifyGuardianContact}
          // Live: the guardian's EMAIL is verified by them linking their own
          // account (code emailed to them); their PHONE by a WhatsApp code to
          // their number, checked server-side (guardian_phone channel).
          canVerify={isSupabaseConfigured ? { phone: true, email: false } : true}
          phoneOtpChannel="guardian_phone"
        />
      )}
      {onEditProfile && player.guardian && (ageOf(player) ?? 0) < 18 && (
        <GuardianLinkCard playerId={player.id} linked={!!player.guardianLinked} hasEmail={!!player.guardian.email} />
      )}

      {/* The verification workflow is the player's own business (and support's) —
          everyone else just sees the ☑️ tick next to the name once approved. */}
      {(onEditProfile || (player.verification && isSupport(viewer?.role))) && (
        <VerificationCard
          player={player}
          owner={!!onEditProfile}
          // A support reviewer viewing someone else's profile opens Details
          // to see the document and approve / reject.
        />
      )}

      {/* App/account preferences (reminders, timezone, sign out, support) now
          live on the dedicated Settings screen instead of trailing the profile. */}
      {onOpenSettings && (
        <Button label="⚙  Settings" variant="ghost" onPress={onOpenSettings} style={{ marginTop: theme.spacing(2) }} />
      )}
      {onSignOut && (
        <Button label="Sign out" variant="ghost" onPress={onSignOut} />
      )}
    </ScrollView>
  );
}

function Stat({ value, label, narrow }: { value: string; label: string; narrow?: boolean }) {
  return (
    <Card style={[st.statCard, narrow && st.statCardNarrow]}>
      <Text style={[st.statValue, value.length > 4 && st.statValueLong]} numberOfLines={1}>{value}</Text>
      <Text style={textStyles.muted}>{label}</Text>
    </Card>
  );
}

/** One club the player has represented, tagging its sport(s), jersey & period. */
function TeamRow({ team }: { team: TeamAffiliation }) {
  const sub = [
    team.sports.map((s) => getSportMeta(s).name).join(', '),
    team.jersey != null ? `#${team.jersey}` : '',
    teamPeriod(team),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card style={st.sportRow}>
      <Glyph emoji="🛡️" style={st.sportIcon} />
      <View style={{ flex: 1 }}>
        <Text style={textStyles.body}>{team.name}</Text>
        {sub ? <Text style={textStyles.muted}>{sub}</Text> : null}
      </View>
    </Card>
  );
}

/** Age & guardian verification — compact: title, status chip, ONE line for what
 *  to do next, "Details ›", and the action only when the owner must act. The
 *  explanation, re-submit, support note, reviewer tools and full history live on
 *  VerificationDetails (docs/security/breaks/verification-card.md). */
function VerificationCard({ player, owner }: { player: Player; owner: boolean }) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [v, setV] = useState(player.verification);
  useEffect(() => setV(player.verification), [player.verification]);
  const { upload, uploading, uploadError } = useVerificationUpload(player, setV);

  const status = v?.status;
  // Fast lanes: a school / club or a parent may already have confirmed the age.
  const confirmedBy = status !== 'approved' && (player.ageVerifiedBy === 'school' || player.ageVerifiedBy === 'parent') ? player.ageVerifiedBy : undefined;
  const summary = verificationSummary({ status, confirmedBy, viewer: owner ? 'owner' : 'reviewer' });
  const tone = summary.tone === 'ok' ? theme.colors.primary : summary.tone === 'wait' ? theme.colors.accent : summary.tone === 'bad' ? theme.colors.danger : theme.colors.textMuted;

  return (
    <Card style={{ gap: theme.spacing(2) }}>
      <View style={st.verifyHead}>
        <Text style={[textStyles.h3, st.headTitle]}>Age & guardian verification</Text>
        <Pill label={summary.chip} color={theme.colors.surfaceAlt} textColor={tone} />
      </View>
      <Text style={textStyles.body} numberOfLines={2}>{summary.next}</Text>
      {summary.action ? (
        <Button label={uploading ? 'Uploading…' : summary.action.label} onPress={upload} disabled={uploading} />
      ) : null}
      {uploadError ? <Text style={st.verifyError}>{uploadError}</Text> : null}
      <TouchableOpacity
        accessibilityRole="link"
        accessibilityLabel="Verification details"
        accessibilityHint="Opens the full explanation, actions and history"
        hitSlop={8}
        onPress={() => nav.navigate('VerificationDetails', { playerId: player.id })}
        style={st.detailsLink}
      >
        <Text style={st.detailsText}>Details ›</Text>
      </TouchableOpacity>
    </Card>
  );
}

const st = StyleSheet.create({
  followRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(2) },
  content: { padding: theme.spacing(4), gap: theme.spacing(3) },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing(6) },
  emptyBlock: { gap: theme.spacing(3), paddingVertical: theme.spacing(8) },
  headerRow: { flexDirection: 'row', gap: theme.spacing(3), alignItems: 'center' },
  verifiedTick: { fontSize: theme.font.body },
  // Wraps: on a narrow phone the status drops under the title instead of being cut off.
  verifyHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  headTitle: { flexShrink: 1 },
  detailsLink: { alignSelf: 'flex-start', paddingVertical: theme.spacing(1) },
  detailsText: { color: theme.colors.primary, fontSize: theme.font.small, fontWeight: '700' },
  verifyError: { color: theme.colors.danger, fontSize: theme.font.small },
  reviewCard: { gap: theme.spacing(2), borderColor: theme.colors.accent },
  reviewCardRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing(2) },
  heroCard: { backgroundColor: theme.colors.primaryDark, borderRadius: theme.radius.xl, padding: theme.spacing(5), overflow: 'hidden' },
  heroArt: { position: 'absolute', right: -78, top: -78 },
  heroName: { color: theme.colors.heroText, fontFamily: theme.fonts.display, fontSize: 30, lineHeight: 31, textTransform: 'uppercase' },
  heroMeta: { color: theme.colors.heroMuted, fontSize: theme.font.small, lineHeight: theme.font.small * 1.4, marginTop: theme.spacing(1) },
  avatar: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: theme.colors.lime, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.10)',
  },
  avatarImg: { width: 72, height: 72 },
  avatarText: { fontSize: theme.font.h2, fontWeight: '800', color: theme.colors.lime },
  camBadge: {
    position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12,
    backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  camIcon: { fontSize: 12 },
  tagRow: { flexDirection: 'row', gap: theme.spacing(2), marginTop: theme.spacing(2), flexWrap: 'wrap' },
  remindersOff: { color: theme.colors.textMuted, fontSize: theme.font.small, fontStyle: 'italic' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3) },
  statCard: { width: '30%', alignItems: 'center', gap: theme.spacing(1), flexGrow: 1 },
  statCardNarrow: { width: '20%', paddingHorizontal: theme.spacing(1) },
  statValue: { color: theme.colors.primary, fontSize: theme.font.h1, fontWeight: '900' },
  /** a W-D-L record ("12-3-10") fits one line on a 375 px phone */
  statValueLong: { fontSize: theme.font.h3, lineHeight: theme.font.h1 + 6 },
  section: { marginTop: theme.spacing(2) },
  sportRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3) },
  detailLine: { color: theme.colors.accent, fontSize: theme.font.tiny, fontWeight: '700', marginTop: 1 },
  summaryLine: { color: theme.colors.text, fontSize: theme.font.small, fontWeight: '600', marginTop: 2 },
  sportIcon: { fontSize: 26 },
  chevron: { color: theme.colors.textMuted, fontSize: theme.font.h2, fontWeight: '700' },
});

/** Own profile of an under-18: get the parent/guardian onto SportnNote so messages
 *  about this player reach THEM (the player never receives messages directly). */
function GuardianLinkCard({ playerId, linked, hasEmail }: { playerId: string; linked: boolean; hasEmail: boolean }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const invite = async () => {
    setBusy(true);
    const r = await inviteGuardianToLink(playerId);
    setBusy(false);
    setNote(r.sent ? 'Sent! Ask your parent/guardian to check their email for the code.' : (r.reason ?? 'Could not send — try again later.'));
  };
  return (
    <Card style={{ gap: 8 }}>
      <Text style={textStyles.h3}>Messages go to your parent/guardian</Text>
      {linked ? (
        <Text style={textStyles.muted}>Your parent/guardian has linked their account. Coaches and scouts who message about you reach them.</Text>
      ) : (
        <>
          <Text style={textStyles.muted}>
            Coaches and scouts can&apos;t message players under 18 directly. Invite your parent/guardian to link their own SportnNote account so they can read and reply.
          </Text>
          {hasEmail ? (
            <Button label={busy ? 'Sending…' : '📨 Email them a link code'} variant="ghost" onPress={invite} disabled={busy} />
          ) : (
            <Text style={textStyles.muted}>Add your parent/guardian&apos;s email in Edit profile first.</Text>
          )}
          {note ? <Text style={textStyles.body}>{note}</Text> : null}
        </>
      )}
    </Card>
  );
}
