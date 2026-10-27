/**
 * Integration harness (quality mandate, 2026-10-28): a real Postgres (PGlite,
 * in-process) with the pieces of Supabase the schema relies on, then
 * supabase/schema.sql and every migration in filename order — so SQL, RLS,
 * triggers, grants and SECURITY DEFINER functions run for real in `npm test`.
 *
 * Supabase stand-ins: the roles (anon / authenticated / service_role …) with
 * Supabase's default privileges, auth.users + auth.uid()/role()/jwt() read
 * from `request.jwt.claims` (as PostgREST sets it), storage, vault, pg_net
 * (calls are recorded in net._calls, never sent) and pg_cron (recorded only).
 *
 *   const db = await bootDb();
 *   const u = await db.signUp({ email: 'a@x.in' });          // auth.users + profiles row
 *   await db.as(u, 'select …');                              // as that user, RLS on
 *   await db.asAnon('select …'); await db.asService('…');
 */
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = join(import.meta.dirname, '..', '..');

const SUPABASE_STUBS = `
do $$ begin
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create role supabase_auth_admin nologin;
  create role authenticator nologin noinherit;
  create role supabase_admin nologin;
exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists vault;
create schema if not exists extensions;
create schema if not exists net;
create schema if not exists cron;
grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text, phone text,
  email_confirmed_at timestamptz, phone_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}', raw_app_meta_data jsonb not null default '{}',
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz, banned_until timestamptz, deleted_at timestamptz
);
create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text, identity_data jsonb);
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, created_at timestamptz default now());
create table if not exists auth.refresh_tokens (id bigserial primary key, user_id text, session_id uuid, revoked boolean);
create or replace function auth.jwt() returns jsonb language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $f$;
create or replace function auth.uid() returns uuid language sql stable as $f$
  select nullif(auth.jwt()->>'sub', '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$
  select nullif(auth.jwt()->>'role', '') $f$;
create or replace function auth.email() returns text language sql stable as $f$
  select auth.jwt()->>'email' $f$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $f$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $f$;
create or replace function storage.filename(name text) returns text language sql immutable as $f$
  select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $f$;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(p_secret text, p_name text, p_description text default null) returns uuid language sql as $f$
  insert into vault.secrets (name, secret) values (p_name, p_secret) on conflict (name) do update set secret = excluded.secret returning id $f$;

create table if not exists net._calls (id bigserial primary key, url text, headers jsonb, body jsonb, at timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language sql as $f$ insert into net._calls (url, headers, body) values (url, headers, body) returning id $f$;
create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
  returns bigint language sql as $f$ insert into net._calls (url, headers) values (url, headers) returning id $f$;

create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $f$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $f$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $f$
  with d as (delete from cron.job where jobname = job_name returning 1) select exists (select 1 from d) $f$;

create or replace view extensions.pg_stat_statements as select 0::bigint as calls, 0::float8 as total_exec_time, ''::text as query where false;
create or replace view extensions.pg_stat_statements_info as select now() as stats_reset;

do $$ begin create publication supabase_realtime; exception when duplicate_object then null; end $$;

-- Supabase's default privileges: anon / authenticated / service_role get rights on
-- everything new in public (RLS and REVOKEs decide the rest).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

/** Lines PGlite can't run as they are (extensions it hasn't got: pg_net is stubbed above). */
const prep = (sql: string) => sql.replace(/create\s+extension\s+if\s+not\s+exists\s+"?pg_net"?[^;]*;/gi, '-- (pg_net stubbed)');

export interface MigrationResult { file: string; error?: string }

export interface TestDb {
  pg: PGlite;
  migrations: MigrationResult[];
  /** run as the superuser (setup) */
  sql<T = Record<string, unknown>>(q: string, params?: unknown[]): Promise<T[]>;
  /** run as a signed-in user (RLS on), like PostgREST */
  as<T = Record<string, unknown>>(userId: string, q: string, params?: unknown[]): Promise<T[]>;
  asAnon<T = Record<string, unknown>>(q: string, params?: unknown[]): Promise<T[]>;
  asService<T = Record<string, unknown>>(q: string, params?: unknown[]): Promise<T[]>;
  /** a confirmed account (auth.users) — the sign-up trigger makes its profile */
  signUp(opts?: { email?: string; phone?: string; phoneConfirmed?: boolean; meta?: Record<string, unknown>; name?: string; dob?: string }): Promise<string>;
}

/** `skip`: leave out migrations whose file name matches (to show a test is red without a fix). */
export async function bootDb(opts: { strict?: boolean; skip?: RegExp } = {}): Promise<TestDb> {
  const pg = await PGlite.create({ extensions: { uuid_ossp, pgcrypto } });
  await pg.exec(SUPABASE_STUBS);
  const files = ['supabase/schema.sql', ...readdirSync(join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql') && !(opts.skip && opts.skip.test(f))).sort().map((f) => `supabase/migrations/${f}`)];
  const migrations: MigrationResult[] = [];
  for (const f of files) {
    try { await pg.exec(prep(readFileSync(join(root, f), 'utf8'))); migrations.push({ file: f }); }
    catch (e) {
      migrations.push({ file: f, error: e instanceof Error ? e.message : String(e) });
      if (opts.strict) throw new Error(`${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const run = async <T,>(role: string, claims: Record<string, unknown> | null, q: string, params: unknown[] = []): Promise<T[]> => {
    return pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims ? JSON.stringify(claims) : '']);
      if (role !== 'postgres') await tx.query(`set local role ${role}`);
      const r = await tx.query<T>(q, params);
      return r.rows;
    });
  };
  const db: TestDb = {
    pg,
    migrations,
    sql: (q, p) => run('postgres', null, q, p),
    as: (uid, q, p) => run('authenticated', { sub: uid, role: 'authenticated' }, q, p),
    asAnon: (q, p) => run('anon', { role: 'anon' }, q, p),
    asService: (q, p) => run('service_role', { role: 'service_role' }, q, p),
    async signUp(o = {}) {
      const id = randomUUID();
      const meta = { full_name: o.name ?? 'Test User', ...(o.dob ? { dob: o.dob } : {}), ...(o.meta ?? {}) };
      await pg.query(
        `insert into auth.users (id, email, phone, email_confirmed_at, phone_confirmed_at, raw_user_meta_data)
         values ($1, $2, $3, case when $2::text is not null then now() end, case when $4 then now() end, $5)`,
        [id, o.email ?? `${id.slice(0, 8)}@test.sportnnote.in`, o.phone ?? null, !!o.phoneConfirmed, JSON.stringify(meta)]);
      return id;
    },
  };
  return db;
}
