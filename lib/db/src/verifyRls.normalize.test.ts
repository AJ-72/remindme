import { describe, expect, it } from "vitest";
import { normalize } from "./verifyRls";

// Pure-logic tests for the expression comparator, no database needed. Exists
// because the first version of `normalize` shipped a real bug (found by
// actually running verifyRls against the live project, not by inspection):
// stripping every paren made `(a or b) and c` equal `a or (b and c)`, and a
// later fix to stop doing that reintroduced a DIFFERENT false-positive
// (Postgres's own leaf-level parens, e.g. `(col = auth.uid())`, no longer
// matched the paren-free generated DDL). These tests pin both failure modes.
describe("normalize", () => {
  it("treats Postgres's leaf-level parens as noise (schema DDL has none, live Postgres always adds them)", () => {
    expect(normalize("blocker_id = auth.uid()")).toBe(normalize("(blocker_id = auth.uid())"));
  });

  it("ignores table-qualification and quoting Postgres adds on print", () => {
    expect(normalize('"blocks"."blocker_id" = auth.uid()')).toBe(normalize("blocker_id = auth.uid()"));
  });

  it("ignores case and whitespace differences", () => {
    expect(normalize("A = auth.uid()  OR  B = auth.uid()")).toBe(normalize("a=auth.uid() or b=auth.uid()"));
  });

  it("treats redundant grouping around a single connective as noise", () => {
    expect(normalize("(a = auth.uid() or b = auth.uid())")).toBe(normalize("a = auth.uid() or b = auth.uid()"));
  });

  it("does NOT conflate different and/or groupings — (a or b) and c vs a or (b and c)", () => {
    // This is the actual security property: a future edit to a multi-clause
    // policy that changes which values a connective applies to must be
    // caught, not normalized away as a "cosmetic" paren difference.
    expect(normalize("(a or b) and c")).not.toBe(normalize("a or (b and c)"));
  });

  it("still recognizes textually identical and/or groupings as equal", () => {
    expect(normalize("(a or b) and c")).toBe(normalize("(a OR b) AND c"));
  });

  it("does NOT conflate `not (a and b)` with `not a and b` — different predicates", () => {
    // Found by adversarial review, not written up front: `not` is a
    // higher-precedence prefix operator the and/or adjacency check above
    // doesn't account for, so a paren pair right after `not` looked
    // "unattached" and got stripped. `not (a and b)` means neither may
    // hold; `not a and b` means a must not hold AND b must — not the same.
    expect(normalize("not (a and b)")).not.toBe(normalize("not a and b"));
    expect(normalize("not (a or b)")).not.toBe(normalize("not a or b"));
  });
});
