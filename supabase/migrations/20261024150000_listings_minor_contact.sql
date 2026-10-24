-- ============================================================================
--  Listings: a child's name and phone are never public (founder, 2026-10-24)
--
--  A Connect listing ("looking for a team / player / opponent / ground") is
--  readable by anyone, logged out included. stamp_listing() wrote the author's
--  REAL full name onto it, and the form prefills the author's own WhatsApp
--  number, so a child who posted one published their full name and phone.
--
--  Now, when the author is a possible minor (under 18, or no date of birth on
--  file — the same rule as players_view), the listing gets their initials and
--  no contact number. Adults are unchanged. The app hides the number field for
--  them and says why (CreateListingScreen).
-- ============================================================================

create or replace function stamp_listing()
  returns trigger language plpgsql security definer set search_path = public as $$
declare p players;
begin
  if not is_client_request() then return new; end if;
  select * into p from players where id = new.author_id;
  if p.id is not null and not player_is_known_adult(p.dob, p.profile_id) then
    new.author_name := name_initials(p.full_name);
    new.contact_phone := null;
    new.contact_verified := false;
    return new;
  end if;
  new.author_name := coalesce(p.full_name, new.author_name);
  new.contact_verified := coalesce(p.phone_verified, false)
    and phone_key(new.contact_phone) is not null
    and phone_key(new.contact_phone) = phone_key(p.phone);
  return new;
end $$;
drop trigger if exists stamp_listing on listings;
create trigger stamp_listing before insert or update on listings
  for each row execute function stamp_listing();

-- Listings already posted by a possible minor (the trigger only runs on app writes).
update listings l
   set author_name = name_initials(p.full_name), contact_phone = null, contact_verified = false
  from players p
 where p.id = l.author_id
   and not player_is_known_adult(p.dob, p.profile_id)
   and (l.contact_phone is not null or l.author_name is distinct from name_initials(p.full_name));
