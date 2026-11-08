-- 2026-11-08: remove false-zero point-detail stats (describe-done.md DD13).
-- Three racket matches where no point was ever described wrote "0 winners / 0 errors …"
-- to every player's career line (8 lines: badminton 4, pickleball 4).
-- A tennis match was checked too and left out: a timeline correction described one
-- point there, so by the rule its detail was tracked and its zeros are real. The code no longer writes these (commit 5e8091ca).
-- This removes ONLY keys that are point-detail keys AND exactly 0, in ONLY these 3 matches.
-- Real counts (games, sets, points, break points, aces in tennis …) are untouched.
-- Key lists are generated from detailKeys() in src/sports/pointDetail.ts.
-- Run in the Supabase SQL editor. Step 1 previews; step 2 changes; it is one transaction.

with targets(sport, match_id, keys) as (values
  ('badminton', '2eca44d4-e817-44c6-8301-e34e13774c01'::uuid, array['winners', 'winnersFh', 'winnersBh', 'winnersSmash', 'winnersJumpSmash', 'winnersDrop', 'winnersClear', 'winnersNetShot', 'winnersNetKill', 'winnersDrive', 'winnersLift', 'winnersPush', 'winnersBlock', 'winnersServe', 'forcedErrors', 'feNet', 'feOut', 'feFault', 'feLong', 'feWide', 'feFh', 'feBh', 'feSmash', 'feJumpSmash', 'feDrop', 'feClear', 'feNetShot', 'feNetKill', 'feDrive', 'feLift', 'fePush', 'feBlock', 'feServe', 'unforcedErrors', 'ueNet', 'ueOut', 'ueFault', 'ueLong', 'ueWide', 'ueFh', 'ueBh', 'ueSmash', 'ueJumpSmash', 'ueDrop', 'ueClear', 'ueNetShot', 'ueNetKill', 'ueDrive', 'ueLift', 'uePush', 'ueBlock', 'ueServe', 'serviceFaults', 'sfHigh', 'sfFoot', 'sfNet', 'sfOut', 'sfBalk', 'sfFault', 'ruleLosses']::text[]),
  ('pickleball', 'bdfe4775-7416-42d1-8234-43cda9ccd023'::uuid, array['aces', 'winners', 'winnersFh', 'winnersBh', 'winnersReturn', 'winnersDrive', 'winnersDrop', 'winnersDink', 'winnersVolley', 'winnersReset', 'winnersLob', 'winnersOverhead', 'winnersErne', 'winnersAtp', 'winnersServe', 'forcedErrors', 'feNet', 'feOut', 'feKitchen', 'feFoot', 'feFh', 'feBh', 'feReturn', 'feDrive', 'feDrop', 'feDink', 'feVolley', 'feReset', 'feLob', 'feOverhead', 'feErne', 'feAtp', 'feServe', 'unforcedErrors', 'ueNet', 'ueOut', 'ueKitchen', 'ueFoot', 'ueFh', 'ueBh', 'ueReturn', 'ueDrive', 'ueDrop', 'ueDink', 'ueVolley', 'ueReset', 'ueLob', 'ueOverhead', 'ueErne', 'ueAtp', 'ueServe', 'serviceFaults', 'sfNet', 'sfOut', 'sfKitchen', 'sfFoot', 'sfIllegal', 'ruleLosses']::text[])
)
-- STEP 1 — PREVIEW (read-only): each line and how many zero detail keys it will lose
select sl.id, sl.sport, sl.match_id, sl.player_id,
       (select count(*) from jsonb_each(sl.stats) kv where kv.key = any(t.keys) and kv.value = '0'::jsonb) as zero_detail_keys,
       (select count(*) from jsonb_each(sl.stats) kv where kv.key = any(t.keys) and kv.value <> '0'::jsonb) as nonzero_detail_keys
from stat_lines sl join targets t on t.sport = sl.sport and t.match_id = sl.match_id
order by sl.sport, sl.player_id;
-- Expect 8 rows: badminton 4, pickleball 4; nonzero_detail_keys = 0 on every row.
-- If any row shows nonzero_detail_keys > 0, STOP and don't run step 2.

-- STEP 2 — CHANGE (run only after the preview looks right)
begin;
with targets(sport, match_id, keys) as (values
  ('badminton', '2eca44d4-e817-44c6-8301-e34e13774c01'::uuid, array['winners', 'winnersFh', 'winnersBh', 'winnersSmash', 'winnersJumpSmash', 'winnersDrop', 'winnersClear', 'winnersNetShot', 'winnersNetKill', 'winnersDrive', 'winnersLift', 'winnersPush', 'winnersBlock', 'winnersServe', 'forcedErrors', 'feNet', 'feOut', 'feFault', 'feLong', 'feWide', 'feFh', 'feBh', 'feSmash', 'feJumpSmash', 'feDrop', 'feClear', 'feNetShot', 'feNetKill', 'feDrive', 'feLift', 'fePush', 'feBlock', 'feServe', 'unforcedErrors', 'ueNet', 'ueOut', 'ueFault', 'ueLong', 'ueWide', 'ueFh', 'ueBh', 'ueSmash', 'ueJumpSmash', 'ueDrop', 'ueClear', 'ueNetShot', 'ueNetKill', 'ueDrive', 'ueLift', 'uePush', 'ueBlock', 'ueServe', 'serviceFaults', 'sfHigh', 'sfFoot', 'sfNet', 'sfOut', 'sfBalk', 'sfFault', 'ruleLosses']::text[]),
  ('pickleball', 'bdfe4775-7416-42d1-8234-43cda9ccd023'::uuid, array['aces', 'winners', 'winnersFh', 'winnersBh', 'winnersReturn', 'winnersDrive', 'winnersDrop', 'winnersDink', 'winnersVolley', 'winnersReset', 'winnersLob', 'winnersOverhead', 'winnersErne', 'winnersAtp', 'winnersServe', 'forcedErrors', 'feNet', 'feOut', 'feKitchen', 'feFoot', 'feFh', 'feBh', 'feReturn', 'feDrive', 'feDrop', 'feDink', 'feVolley', 'feReset', 'feLob', 'feOverhead', 'feErne', 'feAtp', 'feServe', 'unforcedErrors', 'ueNet', 'ueOut', 'ueKitchen', 'ueFoot', 'ueFh', 'ueBh', 'ueReturn', 'ueDrive', 'ueDrop', 'ueDink', 'ueVolley', 'ueReset', 'ueLob', 'ueOverhead', 'ueErne', 'ueAtp', 'ueServe', 'serviceFaults', 'sfNet', 'sfOut', 'sfKitchen', 'sfFoot', 'sfIllegal', 'ruleLosses']::text[])
)
update stat_lines sl
set stats = sl.stats - (
      select coalesce(array_agg(kv.key), '{}'::text[])
      from jsonb_each(sl.stats) kv
      where kv.key = any(t.keys) and kv.value = '0'::jsonb
    ),
    updated_at = now()
from targets t
where t.sport = sl.sport and t.match_id = sl.match_id;
-- Expect "UPDATE 8". Then: commit;   (or rollback; if the count differs)
