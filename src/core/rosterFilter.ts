/** teams.roster is jsonb, so a PostgREST "contains" filter must be JSON
 *  (["id"]). supabase-js turns a bare array into a Postgres array ({id}),
 *  which jsonb rejects — the query then returns nothing. PURE. */
export const rosterContains = (ids: readonly string[]): string => JSON.stringify(ids);
