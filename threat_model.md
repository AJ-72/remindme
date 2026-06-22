# Threat Model

## Project Overview

This repository is a pnpm monorepo with two production-facing artifacts: a small Express 5 API server and an Expo-based mobile/web reminder app. The current production backend is minimal: the API serves only a health endpoint, while the mobile app stores reminder data locally with AsyncStorage and schedules local notifications. Shared libraries provide the OpenAPI contract, generated client code, and a Drizzle/PostgreSQL database layer scaffold.

The current scan assumes future production deployments use Replit-managed TLS and that mockup sandbox code is never deployed. Because there is no live deployment configured now, internet reachability was assessed against the code paths that would run if the API server or Expo static server were deployed publicly.

## Assets

- **Reminder content on user devices** — titles, dates, and descriptions stored in local device storage. This is user data, but it is not currently synchronized to a backend.
- **Application availability** — the API health endpoint and static mobile landing/manifest server should remain available and not expose the host filesystem or crash on malformed requests.
- **Application secrets and infrastructure configuration** — `DATABASE_URL`, future auth tokens, and any future service credentials used by the API server or build pipeline.
- **Server filesystem and static assets** — the static Expo build output and landing-page template served by `artifacts/mobile/server/serve.js`.

## Trust Boundaries

- **Client to API boundary** — any browser, mobile client, or external caller reaching `artifacts/api-server/src/app.ts`. The client is untrusted.
- **Client to static mobile server boundary** — requests reaching `artifacts/mobile/server/serve.js`, including request paths and headers used to select manifests or render the landing page.
- **API to database boundary** — `lib/db/src/index.ts` establishes direct PostgreSQL access using `DATABASE_URL`; compromise at the API layer would eventually imply database compromise once data routes exist.
- **Production vs dev/build tooling boundary** — `artifacts/mobile/scripts/**`, `.expo/**`, and `artifacts/mockup-sandbox/**` are not production request paths and should normally be ignored unless future changes make them reachable.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/**`
- Production static/mobile server: `artifacts/mobile/server/serve.js`, `artifacts/mobile/server/templates/landing-page.html`
- Shared risk areas: `lib/api-client-react/src/custom-fetch.ts`, `lib/db/src/index.ts`, `lib/api-spec/openapi.yaml`
- Public surfaces: `/api/healthz`, `/`, `/manifest`, and static files under Expo `static-build/`
- Dev-only areas to usually skip: `artifacts/mockup-sandbox/**`, `artifacts/mobile/scripts/**`, `artifacts/mobile/.expo/**`

## Threat Categories

### Spoofing

There is no implemented authentication boundary yet, so the main spoofing concern is future expansion: any new non-public API route must require explicit server-side authentication rather than relying on mobile client behavior or generated client helpers. If bearer-token support in `lib/api-client-react/src/custom-fetch.ts` is activated later, the server must verify those tokens on every protected request.

### Tampering

The API and static mobile server both accept untrusted request data. The current guarantee is that request-controlled paths and headers must not let callers alter server files, choose arbitrary files outside the intended static root, or influence privileged server behavior beyond documented routing. Future write-capable API routes must validate request bodies with Zod or equivalent server-side schemas.

### Information Disclosure

The most relevant disclosure risks are accidental leakage of secrets through logs, error details, or future API responses. The API logger already redacts authorization and cookie headers; that guarantee must be preserved as new auth or session mechanisms are added. Static file serving and API errors must not reveal filesystem paths, stack traces, or environment secrets to public callers.

### Denial of Service

Because the current backend is minimal, denial-of-service risk is mostly about malformed or repeated public requests consuming server resources. New routes must avoid unbounded parsing, large uploads, or expensive synchronous work reachable without authentication. External network calls introduced later must use timeouts and bounded retries.

### Elevation of Privilege

There is no admin surface today, but the database layer and future API expansion create a clear privilege boundary. All future data-access routes must enforce authorization server-side, and all database queries must remain parameterized through Drizzle or equivalent safe abstractions. Static file serving must continue to prevent path traversal outside the Expo build output directory.
