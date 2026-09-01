import { PGlite } from "@electric-sql/pglite";

/**
 * A real Postgres, in-process, for testing row level security.
 *
 * PGlite is Postgres compiled to WASM, so policies are enforced by the same
 * engine that will enforce them in production - no daemon, no container, no
 * Supabase CLI. A harness that needs infrastructure is a harness people skip,
 * and this one stands between the schema and an RLS hole.
 *
 * The design turns on one fact: A SUPERUSER BYPASSES RLS, and PGlite's default
 * connection is a superuser. A harness that forgot to switch roles would
 * report every policy as working while enforcing nothing - worse than no
 * tests, because it manufactures confidence. Hence `asUser`/`asAnon`, and
 * hence `asService` being documented as unusable for assertions.
 */

/** Mirrors the Supabase helpers policies are written against. */
const AUTH_SHIM = `
  create schema if not exists auth;

  -- Supabase resolves the caller from a JWT claim; we set the same GUC.
  --
  -- RETURN TYPE MATTERS: Supabase's auth.uid() returns uuid. A text-returning
  -- shim would let a policy written as "id = auth.uid()" pass here and fail on
  -- deploy - Postgres has no text = uuid operator - or invite a cast that
  -- quietly changes what the policy compares. Policies have to read identically
  -- in both places, or these tests are testing a different database.
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
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

  /**
   * Run SQL as the owning superuser, bypassing RLS entirely.
   *
   * This mirrors Supabase's service role and exists for two jobs: seeding rows
   * a user could not legitimately create (another person's account), and
   * checking from outside whether a refused write actually failed to land.
   *
   * Never assert a security property through it. A policy test that reads its
   * result back through here proves nothing, because this connection ignores
   * every policy in the database.
   */
  asService(sql: string): Promise<Record<string, unknown>[]>;

  /**
   * Public tables with row level security switched OFF, in name order.
   *
   * Drizzle enables RLS on a table only when that table declares a policy, so
   * a new table with none is readable and writable by every authenticated
   * caller while looking entirely ordinary in review. Asserting this is empty
   * turns "someone must remember" into "the suite fails".
   */
  tablesWithoutRls(): Promise<string[]>;

  close(): Promise<void>;
}

/** Attach the role-switching interface to an already-prepared database. */
export function wrapRlsTestDb(db: PGlite): RlsTestDb {
  async function run(role: string, uid: string | null, sql: string) {
    // set_config with is_local=true scopes both settings to this transaction,
    // so one query can never leak its identity into the next.
    await db.exec("begin");
    try {
      await db.query("select set_config('role', $1, true)", [role]);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
      const result = await db.query(sql);
      return result.rows as Record<string, unknown>[];
    } finally {
      await db.exec("commit");
    }
  }

  return {
    asUser: (uid, sql) => run("authenticated", uid, sql),
    asAnon: (sql) => run("anon", null, sql),

    async asService(sql: string) {
      // exec, not query: setup is usually several statements, and the extended
      // protocol query() takes only one. Rows come from the last statement.
      const results = await db.exec(sql);
      const last = results[results.length - 1];
      return (last?.rows ?? []) as Record<string, unknown>[];
    },

    async tablesWithoutRls() {
      const result = await db.query<{ tablename: string }>(
        `select c.relname as tablename
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
          order by c.relname`
      );
      return result.rows.map((r) => r.tablename);
    },

    close: () => db.close(),
  };
}

/** Prepare a fresh database carrying `ddl`, plus the Supabase auth shim. */
export async function prepare(ddl: string): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(AUTH_SHIM);
  await db.exec(ddl);
  await db.exec(GRANTS);
  return db;
}

export async function createRlsTestDb(ddl: string): Promise<RlsTestDb> {
  return wrapRlsTestDb(await prepare(ddl));
}
