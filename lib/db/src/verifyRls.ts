/**
 * Verify that every RLS policy actually deployed to DATABASE_URL matches
 * what the schema source says it should be — not just that a policy with
 * that name exists, and not just that `rls_enabled` is true.
 *
 * Exists because `drizzle-kit push` was found (2026-09-08) to have deployed
 * every policy on the live project with a NULL qualifier — `USING (true)`,
 * enforcing nothing — while `rls_enabled` stayed true on every table and
 * `mcp__Supabase__get_advisors` showed nothing wrong the entire time. Root
 * cause is unresolved (see system_learnings.md's 2026-09-08 entry); this
 * script exists so the next regression fails a command instead of requiring
 * someone to remember to run a manual query from a markdown file.
 *
 * A NULL qualifier is NOT "no policy" (which would default-deny) — it is
 * unconditionally permissive, which is worse than skipping RLS entirely
 * because it looks protected in every surface check while protecting
 * nothing. Checked per-command, not as a blanket "non-null": `polqual` is
 * legitimately NULL for INSERT-only policies (they only have `withCheck`),
 * and `polwithcheck` is legitimately NULL for SELECT/DELETE-only policies.
 *
 * Runs via vitest (not plain `node`), driven by `verifyRls.test.ts` — the
 * schema module's internal imports are extensionless TS paths that only
 * vitest's esbuild-based resolver, not Node's own ESM loader, resolves
 * without a separate build step:
 *
 *   pnpm --filter @workspace/db run verify:rls
 */
import pg from "pg";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "./schema/index";

async function schemaDdl(schemaModule: Record<string, unknown>): Promise<string> {
  const empty = generateDrizzleJson({});
  const target = generateDrizzleJson(schemaModule);
  const statements = await generateMigration(empty, target);
  return statements.join("\n");
}

type ExpectedPolicy = {
  name: string;
  table: string;
  cmd: string;
  using?: string;
  check?: string;
  needsUsing: boolean;
  needsCheck: boolean;
};

/**
 * Parse `CREATE POLICY "name" ON "table" AS PERMISSIVE FOR <cmd> TO <role>
 * USING (...) [WITH CHECK (...)];` statements out of generated DDL.
 *
 * A regex parser over DDL we generated ourselves (not hand-written SQL) is
 * acceptable here: the shape is fixed by drizzle-kit's own emitter, and this
 * only ever runs against our own schema module, never untrusted input.
 */
function parseExpectedPolicies(ddl: string): ExpectedPolicy[] {
  const policyRe =
    /CREATE POLICY "([^"]+)" ON "([^"]+)"[^;]*?FOR (\w+)[^;]*?(?:USING \(([^;]*?)\))?(?:\s*WITH CHECK \(([^;]*?)\))?;/gs;
  const results: ExpectedPolicy[] = [];
  let match: RegExpExecArray | null;
  while ((match = policyRe.exec(ddl)) !== null) {
    const [, name, table, cmd, using, check] = match;
    const cmdUpper = cmd.toUpperCase();
    results.push({
      name,
      table,
      cmd: cmdUpper,
      using: using?.trim(),
      check: check?.trim(),
      // INSERT: WITH CHECK only. SELECT/DELETE: USING only. UPDATE/ALL: both.
      needsUsing: cmdUpper !== "INSERT",
      needsCheck: cmdUpper === "INSERT" || cmdUpper === "UPDATE" || cmdUpper === "ALL",
    });
  }
  return results;
}

export function normalize(expr: string): string {
  // Postgres round-trips a policy expression through its own printer:
  // lowercased, and every column reference qualified with its table name
  // and double-quoted (`"table"."col"` even though the generated DDL wrote
  // bare `col`) — neither changes what the expression means, so both are
  // stripped. Whitespace is collapsed the same way.
  //
  // Parens are the hard part: Postgres wraps EVERY atomic comparison in its
  // own parens on print (`col = auth.uid()` becomes `(col = auth.uid())`)
  // even though the generated DDL never has them — that's pure noise and
  // must be ignored, or every single-clause policy here would false-fail.
  // But `(a or b) and c` vs `a or (b and c)` are different predicates, so
  // grouping parens around a MIXED `and`/`or` expression must NOT be
  // ignored. The distinction: strip a paren pair only when it wraps zero
  // top-level boolean connectives at its own nesting level (an atomic
  // comparison, or a run of the SAME connective) — never one that changes
  // and/or associativity. None of the 13 current policies mix `and`/`or`,
  // so this only needs to not break on that case, not solve it generally.
  const noQuotesOrCase = expr
    .toLowerCase()
    .replace(/"[a-z0-9_]+"\./g, "")
    .replace(/["]/g, "");
  // Paren-stripping needs word boundaries around "and"/"or" to tell adjacent
  // connectives apart from identifier substrings, so it runs BEFORE
  // whitespace is collapsed — collapsing first would glue `) and` into
  // `)and`, breaking the \b-based adjacency checks stripRedundantParens
  // relies on to tell "(a or b) and c" apart from "a or (b and c)".
  return stripRedundantParens(noQuotesOrCase).replace(/\s+/g, "");
}

/**
 * Repeatedly strip a paren pair when doing so cannot change and/or
 * associativity — i.e. every connective adjacent to the paren pair, both
 * inside it and immediately outside it, is the same. `(a or b) and c` must
 * NOT strip to `a or b and c`: the paren's *inside* is uniform (`or` only),
 * but the connective immediately *outside* it (`and`) differs, so removing
 * the parens would change which operands `and` binds to. A bare
 * "does the inside mix and/or" check misses exactly this case — it has to
 * also look at what sits right outside the parens.
 *
 * `not` is handled separately from `and`/`or`: it is a higher-precedence
 * prefix operator, not a connective the before/after check above accounts
 * for, so `not (a and b)` was originally treated as "nothing outside" and
 * stripped to the same text as `not a and b` — a real semantic difference
 * (`not (a and b)` = neither may hold; `not a and b` = a must not hold AND
 * b must). Found by an adversarial review constructing exactly this input,
 * not by inspection. `not` immediately before a paren pair always blocks
 * stripping, independent of what's inside.
 */
function stripRedundantParens(s: string): string {
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\(([^()]*)\)/g, (whole, inner: string, offset: number, full: string) => {
      const before = full.slice(0, offset);
      if (/\bnot\s*$/.test(before)) return whole; // `not (...)` — never safe to strip

      const hasAnd = /\band\b/.test(inner);
      const hasOr = /\bor\b/.test(inner);
      if (hasAnd && hasOr) return whole; // mixed inside — never safe to strip

      const after = full.slice(offset + whole.length);
      const connectiveBefore = /\b(and|or)\s*$/.exec(before)?.[1];
      const connectiveAfter = /^\s*(and|or)\b/.exec(after)?.[1];
      const innerConnective = hasAnd ? "and" : hasOr ? "or" : undefined;

      // If the inside has a connective, and something outside touches this
      // paren pair with a DIFFERENT connective, stripping would let that
      // outside connective silently reach into the inside's operands.
      if (innerConnective) {
        if (connectiveBefore && connectiveBefore !== innerConnective) return whole;
        if (connectiveAfter && connectiveAfter !== innerConnective) return whole;
      }
      return inner;
    });
  } while (s !== prev);
  return s;
}

// pg_policy.polcmd is a single character, not the command name.
// https://www.postgresql.org/docs/current/catalog-pg-policy.html
const POLCMD_TO_COMMAND: Record<string, string> = {
  r: "SELECT",
  a: "INSERT",
  w: "UPDATE",
  d: "DELETE",
  "*": "ALL",
};

/**
 * Parse a Postgres array-literal ("{a,b,c}") into a JS string array.
 * `pg` returns this as raw text for a `name[]` result with no registered
 * type parser — confirmed empirically, not assumed — so this can't rely on
 * driver coercion. None of the role names here ever need comma/brace
 * escaping (they're plain identifiers like "authenticated"), so a plain
 * split is sufficient; this is not a general-purpose Postgres array parser.
 */
function parsePgTextArray(literal: string): string[] {
  const inner = literal.replace(/^\{/, "").replace(/\}$/, "");
  return inner === "" ? [] : inner.split(",");
}

export async function verifyRls(databaseUrl: string): Promise<string[]> {
  const ddl = await schemaDdl(schema as unknown as Record<string, unknown>);
  const expectedPolicies = parseExpectedPolicies(ddl);

  if (expectedPolicies.length === 0) {
    throw new Error(
      "No CREATE POLICY statements found in generated DDL — schema import or " +
        "DDL generation is broken; this check would otherwise pass vacuously."
    );
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  const failures: string[] = [];
  try {
    // 1. Every table with a policy must have RLS actually enabled. A correct
    // policy expression on a table where RLS itself is off enforces nothing.
    const { rows: rlsRows } = await client.query<{ table_name: string; rls_enabled: boolean }>(`
      select c.relname as table_name, c.relrowsecurity as rls_enabled
      from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    `);
    const rlsByTable = new Map(rlsRows.map((r) => [r.table_name, r.rls_enabled]));

    const expectedTables = new Set(expectedPolicies.map((p) => p.table));
    for (const table of expectedTables) {
      if (!rlsByTable.get(table)) {
        failures.push(`${table}: RLS is not enabled (relrowsecurity != true)`);
      }
    }

    // 2. Every expected policy must exist live with matching USING/WITH
    // CHECK text, present exactly where the command requires it and absent
    // where Postgres wouldn't allow it (per-command, not blanket non-null).
    const { rows: rawLiveRows } = await client.query<{
      polname: string;
      table_name: string;
      cmd: string;
      permissive: boolean;
      // node-postgres does not automatically parse a `name[]` result into a
      // JS array unless a type parser is registered for that OID — this
      // comes back as the raw Postgres array-literal text ("{authenticated}"),
      // confirmed by running this query for real and getting exactly that
      // string. Parsed below, not left to `pg` to coerce.
      roles: string;
      using_expr: string | null;
      check_expr: string | null;
    }>(`
      select p.polname, c.relname as table_name, p.polcmd as cmd,
             p.polpermissive as permissive,
             array(select rolname from pg_roles where oid = any(p.polroles) order by rolname) as roles,
             pg_get_expr(p.polqual, p.polrelid) as using_expr,
             pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      where c.relnamespace = 'public'::regnamespace
    `);
    const liveRows = rawLiveRows.map((r) => ({ ...r, roles: parsePgTextArray(r.roles) }));
    const liveByName = new Map(liveRows.map((r) => [r.polname, r]));

    for (const expected of expectedPolicies) {
      const live = liveByName.get(expected.name);
      if (!live) {
        failures.push(`${expected.name}: policy does not exist on the live database`);
        continue;
      }
      if (live.table_name !== expected.table) {
        failures.push(
          `${expected.name}: expected on table "${expected.table}", found on "${live.table_name}"`
        );
      }
      const liveCmd = POLCMD_TO_COMMAND[live.cmd] ?? live.cmd;
      if (liveCmd !== expected.cmd) {
        failures.push(
          `${expected.name}: command mismatch — expected FOR ${expected.cmd}, deployed as FOR ${liveCmd}`
        );
      }
      if (!live.permissive) {
        failures.push(
          `${expected.name}: deployed RESTRICTIVE — schema declares every policy PERMISSIVE (the default); a RESTRICTIVE policy combines differently and this drift would silently change what's enforced`
        );
      }
      // Every policy in this schema is `to: "authenticated"` — see
      // schema/*.ts. If that ever needs to vary per-policy, generate the
      // expected role set from the DDL the same way `using`/`check` are,
      // rather than hardcoding it here.
      if (live.roles.length !== 1 || live.roles[0] !== "authenticated") {
        failures.push(
          `${expected.name}: role mismatch — expected {authenticated}, deployed as {${live.roles.join(", ")}}`
        );
      }
      if (expected.needsUsing) {
        if (!live.using_expr) {
          failures.push(`${expected.name}: USING is NULL — this policy is unconditionally permissive`);
        } else if (normalize(live.using_expr) !== normalize(expected.using ?? "")) {
          failures.push(
            `${expected.name}: USING mismatch — expected "${expected.using}", got "${live.using_expr}"`
          );
        }
      } else if (live.using_expr) {
        failures.push(
          `${expected.name}: USING is set ("${live.using_expr}") but this command shouldn't have one`
        );
      }
      if (expected.needsCheck) {
        if (!live.check_expr) {
          failures.push(`${expected.name}: WITH CHECK is NULL — this policy is unconditionally permissive`);
        } else if (normalize(live.check_expr) !== normalize(expected.check ?? "")) {
          failures.push(
            `${expected.name}: WITH CHECK mismatch — expected "${expected.check}", got "${live.check_expr}"`
          );
        }
      } else if (live.check_expr) {
        failures.push(
          `${expected.name}: WITH CHECK is set ("${live.check_expr}") but this command shouldn't have one`
        );
      }
    }

    // 3. No unexpected policy — an extra permissive policy is as dangerous
    // as a missing restrictive one, and this catches a leftover from manual
    // debugging (see this bug's own history) being left live by mistake.
    const expectedNames = new Set(expectedPolicies.map((p) => p.name));
    for (const live of liveRows) {
      if (!expectedNames.has(live.polname)) {
        failures.push(`${live.polname}: policy exists live but is not declared in the schema`);
      }
    }
  } finally {
    await client.end();
  }

  return failures;
}
