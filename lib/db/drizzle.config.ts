import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // drizzle-kit resolves `schema` as a glob pattern internally, and glob
  // syntax treats backslashes as escape characters - path.join()'s
  // backslashes on Windows silently matched zero files there while working
  // fine on Linux/Mac. Forward slashes are valid glob syntax on every OS,
  // so build the path with them explicitly rather than via path.join/sep.
  schema: path.posix.join(__dirname.split(path.sep).join("/"), "./src/schema/index.ts"),
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
