-- Fix "add a player by phone / email" (live error log 2026-10-29: "cannot execute
-- INSERT in a read-only transaction").
--
-- PostgREST runs an rpc declared STABLE or IMMUTABLE in a READ ONLY transaction.
-- These two lookups record a rate-limit hit (an INSERT), so they must be VOLATILE.
-- 20261017120000_contact_lookup_volatile fixed this once; security Wave 1
-- (20261028120000_security_wave1, W1-7) recreated both from an older body that
-- still said STABLE. Only the volatility changes — bodies, grants and the
-- rate limit stay as they are.
--
-- tests/db-readonly-rpc.test.mts calls them the way PostgREST does and checks no
-- read-only function ever writes, directly or through another function.
alter function public.find_player_by_phone(text) volatile;
alter function public.find_player_by_email(text) volatile;
