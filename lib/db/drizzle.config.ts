import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // `authenticated` and `anon` are Supabase's, not ours. Without this,
  // drizzle-kit sees roles it did not create referenced by our policies and
  // proposes managing them - up to and including dropping them, which would
  // take the whole project's auth down.
  entities: {
    roles: {
      provider: "supabase",
    },
  },
});
