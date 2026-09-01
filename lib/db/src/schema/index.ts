// One file per table, each exporting a Drizzle table, an `insertXSchema` via
// drizzle-zod, and `InsertX`/`X` types. See `users.ts` for the shape.
//
// TWO THINGS TO GET RIGHT WHEN ADDING A TABLE HERE:
//
// 1. Re-export it below. A table file that is not re-exported is absent from
//    the generated DDL, so its policies go untested AND unpushed, while every
//    other test in this package still passes. `schema.test.ts` pins the table
//    list to catch this.
//
// 2. Give it an RLS policy. Drizzle enables row level security on a table only
//    if that table declares one, so a table with no policy is readable and
//    writable by every authenticated caller - and looks entirely ordinary in
//    review. `schema.test.ts` asserts no such table exists.
//
// Anything RLS cannot express because it is column-shaped rather than
// row-shaped belongs in `privileges.sql`.

export * from "./blocks";
export * from "./devices";
export * from "./invitations";
export * from "./linkCodes";
export * from "./users";
