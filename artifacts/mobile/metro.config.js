const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Release builds (`expo export:embed`, run by Gradle's createBundle*JsAndAssets)
// pass the entry relative to this folder ("index.ts"), but in a pnpm monorepo
// Expo sets Metro's server root to the workspace root, so it resolves against
// the repo root and fails: "Unable to resolve module ./index.ts from <repo>".
// Embed runs no dev server, so pinning the server root here only affects entry
// resolution; the dev server keeps the workspace root. See system_learnings.md
// (2026-08-24, trap 1).
if (process.argv.includes("export:embed")) {
  config.server = { ...config.server, unstable_serverRoot: __dirname };
}

module.exports = config;
