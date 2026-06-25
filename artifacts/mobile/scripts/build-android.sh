#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# build-android.sh — Build a real Android APK via EAS
#
# Usage:
#   ./scripts/build-android.sh           # preview APK (default, fastest)
#   ./scripts/build-android.sh preview   # same as above
#   ./scripts/build-android.sh prod      # production APK
#   ./scripts/build-android.sh dev       # development build (includes dev menu)
#
# Requirements:
#   - EXPO_TOKEN env var set (get one at expo.dev → Settings → Access Tokens)
#     Add it to Replit Secrets as EXPO_TOKEN so it's always available.
#   - Project already linked (app.json has extra.eas.projectId)
# ---------------------------------------------------------------------------

set -euo pipefail

PROFILE="${1:-preview}"

# Map shorthand names to eas.json profile keys
case "$PROFILE" in
  prod|production) PROFILE="production" ;;
  dev|development) PROFILE="development" ;;
  preview)         PROFILE="preview" ;;
  *)
    echo "❌  Unknown profile: $PROFILE"
    echo "    Valid options: preview (default) | prod | dev"
    exit 1
    ;;
esac

# Verify EXPO_TOKEN is set
if [ -z "${EXPO_TOKEN:-}" ]; then
  echo ""
  echo "❌  EXPO_TOKEN is not set."
  echo ""
  echo "    1. Go to https://expo.dev → your account → Settings → Access Tokens"
  echo "    2. Create a new token"
  echo "    3. Add it to Replit Secrets as  EXPO_TOKEN"
  echo "    4. Re-run this script"
  echo ""
  exit 1
fi

echo ""
echo "🔨  Building Android APK"
echo "    Profile : $PROFILE"
echo "    Package : com.curios.remindme"
echo ""

cd "$(dirname "$0")/.."

npx eas-cli build \
  --platform android \
  --profile "$PROFILE" \
  --non-interactive

echo ""
echo "✅  Build submitted. Track progress at https://expo.dev/builds"
echo "    When complete, download the APK from the build page or scan the QR code."
echo ""
