import { describe, expect, it } from "vitest";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { schemaDdl } from "./schemaDdl";

describe("schemaDdl", () => {
  it("renders a drizzle schema as the DDL Postgres will actually receive", async () => {
    const widgets = pgTable("widgets", {
      id: uuid("id").primaryKey().defaultRandom(),
      label: text("label").notNull(),
    });

    const ddl = await schemaDdl({ widgets });

    expect(ddl).toContain('CREATE TABLE "widgets"');
    expect(ddl).toContain('"label" text NOT NULL');
  });
});
