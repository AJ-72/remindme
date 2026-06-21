---
name: Expo workflow health check failure
description: restart_workflow consistently fails for Expo mobile artifacts with DIDNT_OPEN_A_PORT even when Metro is running
---

## The Rule

The `restart_workflow` tool fails for Expo mobile artifacts with `DIDNT_OPEN_A_PORT` every time, even though Metro starts successfully and is confirmed running on the configured port.

**Why:** The Replit workflow health check cannot verify port 18115 for Expo services. Metro fully starts (logs confirm it), but the infrastructure-level port check sees the port as closed. Root cause is unknown — it may be related to how Expo's `router = "expo-domain"` bypasses the shared proxy that the health check uses.

**What was tried (all failed):**
- Multiple timeouts (30s, 60s, 120s)
- Pre-start proxy server on port 18115 (proxy starts instantly, forwards to Metro on 18116)
- Removing `--localhost` from expo start command
- Removing `ensurePreviewReachable` from artifact.toml
- Removing `router = "expo-domain"` from artifact.toml

**What IS confirmed working:** Metro starts fully every time. The QR code URL is valid. The app is ready to use via Expo Go once running.

**How to apply:** When building an Expo mobile app in this environment:
- Do not retry `restart_workflow` more than 2-3 times after Metro is confirmed starting
- Tell the user to restart the workflow manually from the Replit UI
- The app code itself is fine; this is an environmental/platform issue
- The QR code URL from the workflow logs works once the user manually starts the workflow
