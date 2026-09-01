import { PGlite } from "@electric-sql/pglite";

/**
 * An in-process Postgres for testing Row Level Security policies.
 *
 * Uses PGlite - real Postgres compiled to WASM - so RLS tests run inside the
 * ordinary test command with no Docker, no daemon and no Supabase CLI. That
 * matters: a harness that needs infrastructure is a harness people skip.
 *
 * THE TRAP THIS EXISTS TO PREVENT: a superuser bypasses RLS entirely. PGlite's
 * default connection IS a superuser, so a harness that forgot to switch roles
 * would report every policy as working while enforcing nothing at all - the
 * worst possible outcome, because it manufactures false confidence. Hence there
 * is deliberately NO method here that runs an unprivileged-looking query as the
 * superuser; every query goes through asUser or asAnon.
 */

/** Mirrors the Supabase helpers policies are written against. */
const AUTH_SHIM = `
  create schema if not exists auth;

  -- Supabase resolves the caller from a JWT claim; we set the same GUC.
  create or replace function auth.uid() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')
  $$;

  create role authenticated nologin;
  create role anon nologin;
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`;

/** Grants run after the caller's DDL, so they cover tables it created. */
const GRANTS = `
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant usage, select on all sequences in schema public to authenticated;
  grant select on all tables in schema public to anon;
`;

export interface RlsTestDb {
  /** Run SQL as an authenticated user with the given id. */
  asUser(uid: string, sql: string): Promise<Record<string, unknown>[]>;
  /** Run SQL with no authenticated user - auth.uid() is null. */
  asAnon(sql: string): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

export async function createRlsTestDb(ddl: string): Promise<RlsTestDb> {
  const db = new PGlite();
  await db.exec(AUTH_SHIM);
  await db.exec(ddl);
  await db.exec(GRANTS);

  async function run(role: string, uid: string | null, sql: string) {
    // set_config with is_local=true scopes both settings to this transaction,
    // so one query can never leak its identity into the next.
    await db.exec("begin");
    try {
      await db.query("select set_config('role', $1, true)", [role]);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
        uid ?? "",
      ]);
      const result = await db.query(sql);
      return result.rows as Record<string, unknown>[];
    } finally {
      await db.exec("commit");
    }
  }

  return {
    asUser: (uid, sql) => run("authenticated", uid, sql),
    asAnon: (sql) => run("anon", null, sql),
    close: () => db.close(),
  };
}
