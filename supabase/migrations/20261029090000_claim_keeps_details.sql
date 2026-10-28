-- ============================================================================
--  Link by phone keeps the account's own profile details (founder, 2026-10-29:
--  "I went to my profile and I have lost my profile details").
--
--  claim_player_by_phone (Wave 2b) kept the coach-made profile and deleted the
--  account's own, copying only the name, date of birth, guardian and email.
--  The rest of the account's own profile was lost: sports, city, photo, bio,
--  house, jersey, privacy choices and sport details, plus the rows that hang off
--  it and aren't "history" (followers, member consents, link declines, held
--  stats). Now:
--    • the account's own details fill the kept profile; their own entries win,
--      a detail they never filled keeps the coach's, and sports are joined;
--    • followers, consents, declines, held stats and log references move to the
--      kept profile (a row both already have isn't duplicated) before the
--      empty duplicate is removed.
--  The checks before linking are unchanged. Idempotent — safe to re-run.
-- ============================================================================

create or replace function claim_player_by_phone(p_profile uuid, p_phone text)
  returns text language plpgsql security definer set search_path = public as $$
declare
  k text := phone_key(p_phone);
  target players%rowtype;
  own players%rowtype;
  own_count int;
  my_dob date;
  my_first text;
begin
  if p_profile is null or k is null then return 'none'; end if;
  select * into target from players p
   where p.profile_id is null and p.reported_at is null and phone_key(p.phone) = k
   order by p.created_at limit 1
   for update;
  if not found then return 'none'; end if;

  select count(*) into own_count from players p where p.profile_id = p_profile;
  if own_count > 1 then return 'support'; end if;
  if own_count = 1 then select * into own from players p where p.profile_id = p_profile; end if;
  my_dob := coalesce(own.dob, (select pr.dob from profiles pr where pr.id = p_profile));
  -- W2bB-06: the same first name — a parent's number on a child's profile, or a
  -- wrong number, mustn't hand the child's profile to the number's owner.
  my_first := split_part(lower(btrim(regexp_replace(coalesce(own.full_name, (select pr.full_name from profiles pr where pr.id = p_profile), ''), '\s+', ' ', 'g'))), ' ', 1);
  if my_first = '' or my_first <> split_part(lower(btrim(regexp_replace(coalesce(target.full_name, ''), '\s+', ' ', 'g'))), ' ', 1) then
    return 'support';
  end if;
  if my_dob is not null and target.dob is not null and extract(year from my_dob) <> extract(year from target.dob) then
    return 'support';
  end if;
  if own.guardian_profile_id is not null and target.guardian_profile_id is not null
     and own.guardian_profile_id <> target.guardian_profile_id then
    return 'support';
  end if;
  if own_count = 1 and player_has_history(own.id) then return 'support'; end if;

  perform set_config('app.trusted_rpc', 'on', true);
  if own_count = 1 then
    -- what hangs off the account's own profile moves to the kept one (a row
    -- both already have stays once), then the empty duplicate goes
    update follows f set target_id = target.id
     where f.target_type = 'player' and f.target_id = own.id
       and not exists (select 1 from follows x where x.follower_id = f.follower_id and x.target_type = 'player' and x.target_id = target.id);
    delete from follows f where f.target_type = 'player' and f.target_id = own.id;
    update member_consents c set player_id = target.id
     where c.player_id = own.id
       and not exists (select 1 from member_consents x where x.kind = c.kind and x.group_id = c.group_id and x.player_id = target.id);
    update member_link_declines d set player_id = target.id
     where d.player_id = own.id
       and not exists (select 1 from member_link_declines x where x.kind = d.kind and x.group_id = d.group_id and x.player_id = target.id);
    update parked_stat_lines s set player_id = target.id
     where s.player_id = own.id
       and not exists (select 1 from parked_stat_lines x where coalesce(x.match_id, x.event_id) = coalesce(s.match_id, s.event_id) and x.player_id = target.id);
    update consent_log set player_id = target.id where player_id = own.id;
    update activity_log set by_player_id = target.id where by_player_id = own.id;
    update link_reports set player_id = target.id where player_id = own.id;
    delete from players p where p.id = own.id;
  end if;
  update players p
     set profile_id = p_profile,
         phone_verified = true,
         full_name = coalesce(own.full_name, p.full_name),
         dob = coalesce(own.dob, p.dob),
         guardian = coalesce(own.guardian, p.guardian),
         guardian_profile_id = coalesce(p.guardian_profile_id, own.guardian_profile_id),
         email = coalesce(own.email, p.email),
         email_verified = case when own.email is not null then own.email_verified else p.email_verified end,
         -- the account's own profile details (their entries win; sports joined)
         sports = (select coalesce(array_agg(distinct x order by x), '{}') from unnest(coalesce(p.sports, '{}') || coalesce(own.sports, '{}')) x),
         sport_details = case when own.sport_details is null then p.sport_details
                              else coalesce(p.sport_details, '{}'::jsonb) || own.sport_details end,
         city = coalesce(own.city, p.city),
         gender = coalesce(own.gender, p.gender),
         bio = coalesce(own.bio, p.bio),
         photo_url = coalesce(own.photo_url, p.photo_url),
         jersey_no = coalesce(own.jersey_no, p.jersey_no),
         house_name = coalesce(own.house_name, p.house_name),
         house_color = coalesce(own.house_color, p.house_color),
         school_id = coalesce(p.school_id, own.school_id),
         show_phone = coalesce(own.show_phone, p.show_phone),
         show_email = coalesce(own.show_email, p.show_email),
         findable_by_contact = coalesce(own.findable_by_contact, p.findable_by_contact),
         passport_code = coalesce(p.passport_code, own.passport_code),
         verification = case when own.verification->>'status' = 'approved' then own.verification else coalesce(p.verification, own.verification) end,
         dob_confirmations = case when own.dob_confirmations is null then p.dob_confirmations
                                  else coalesce(p.dob_confirmations, '{}'::jsonb) || own.dob_confirmations end
   where p.id = target.id and p.profile_id is null;
  perform set_config('app.trusted_rpc', 'off', true);
  return 'linked';
end $$;
revoke all on function claim_player_by_phone(uuid, text) from public, anon, authenticated;
grant execute on function claim_player_by_phone(uuid, text) to service_role;
