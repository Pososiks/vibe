# Testing

The goal of this template's tests is to show future agents where behavior should be verified in a Supabase-native app with no application server. There is no backend tier and no local Postgres container to test against; verification happens at the shared schema, the webapp, the Edge Functions, and one end-to-end browser flow that runs against a real Supabase project.

## Layers

- **Contract/unit (Zod):** shared schema matrices in `packages/contracts` — profile shape and the API error envelope.
- **Webapp unit:** pure UI rules and policies that would be brittle or expensive in E2E (for example the typography policy/render tests in `webapp/tests`).
- **Edge Function unit (Deno):** privileged payment logic — webhook signature verification and event→row mapping in `supabase/functions/creem-webhook/creem-webhook.test.ts`.
- **Webapp E2E (Playwright):** the valuable browser journeys against a real Supabase project, including the authenticated subscription flow.
- **Mobile (Maestro):** lives on the `mobile` branch with the runnable Expo app.

## Choosing Test Level

Default to the highest useful behavioral boundary:

- Use E2E when the risk is user-visible and crosses the browser/Supabase boundary: sign-in, session restore, the authenticated area, navigation, and important empty/error states.
- Use Edge Function unit tests for the payment-critical logic that never runs in the browser: HMAC signature acceptance/rejection and webhook event mapping. These are pure, fast, and security-relevant, so they belong below E2E.
- Use contract/unit tests for shared schema matrices and pure UI rules with many branches.

Keep authorization correctness (owner-only reads) anchored in RLS policies in `supabase/migrations/`; E2E exercises the user-visible result of those policies rather than re-testing every branch.

For TDD-first work, list the expected behavior and important edge cases before implementing, then write the first failing test at the boundary that best catches the regression. Important edge cases include schema validation boundaries, rejected/invalid webhook signatures, unmapped event types, unauthenticated access, empty data, and session restore after reload.

## Running Tests

All commands run from the repository root.

```bash
bun run typecheck        # typecheck every workspace
bun run test             # contracts + webapp unit tests
bun run test:contracts   # packages/contracts Zod schema tests
bun run test:webapp      # webapp unit tests
bun run e2e:webapp       # webapp Playwright E2E (needs a Supabase project)
```

Edge Function tests run with Deno, since the functions are Deno modules:

```bash
deno test supabase/functions/creem-webhook/creem-webhook.test.ts
# or the whole functions tree:
deno test supabase/functions/
```

Contract tests live in `packages/contracts/src/*.test.ts` and protect the shared schemas used by the webapp (and the `mobile` branch). Webapp unit tests live in `webapp/tests`. The `mobile` branch extends this same contract/testing model for Expo.

## Webapp E2E

Playwright is configured in `webapp/playwright.config.ts`. It starts Vite through `webServer`; Vite reads `webapp/.env` for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. There is no Docker, no local Postgres, and no test-database machinery — the E2E flow runs against a real Supabase project.

First-time setup:

```bash
bun run --cwd webapp e2e:install   # install Playwright browsers
bun run e2e:webapp
```

### Environment

```bash
VITE_SUPABASE_URL=<your-supabase-project-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>   # server-side only, for seeding
E2E_WEB_PORT=<web-port>                                       # optional, defaults to 4173
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are the public, browser-shipped values the app uses. `SUPABASE_SERVICE_ROLE_KEY` is server-side only: it is read from `process.env` or the gitignored `webapp/.env`, is never prefixed with `VITE_`, and is never shipped to the browser bundle. The global setup uses it to seed the authenticated flow.

### How the flow works

`webapp/e2e/global-setup.ts` resolves the Supabase env (from `process.env` or `webapp/.env`) and then:

- If `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are all present, it creates a throwaway confirmed user with the service-role admin client, signs that user in with the anon client, and writes the session to `e2e/.artifacts/e2e-session.json`. The authenticated auth spec uses that seeded session.
- If `SUPABASE_SERVICE_ROLE_KEY` (or the URL/anon key) is missing, it logs a warning and skips seeding. The **authenticated spec skips**; the unauthenticated spec still runs.

This keeps the suite runnable with only the public keys (unauthenticated coverage) while still allowing full authenticated coverage when the service-role key is provided.

Playwright artifacts live in `webapp/e2e/.artifacts/` and are not committed. For interactive debugging:

```bash
bun run --cwd webapp e2e:ui
```

## Mobile Maestro E2E

The default branch intentionally does not contain the runnable Expo app or Maestro runner. Use the `mobile` branch for mobile E2E setup, dev-client guidance, stable React Native `testID` selectors, and `bun run --cwd mobile e2e:maestro:audit`.

## Current Upstream Documentation

For testing questions, consult the current upstream documentation linked here first. This document describes this repository's testing contract; upstream docs are authoritative for runner behavior.

- [Playwright intro](https://playwright.dev/docs/intro)
- [Playwright `webServer`](https://playwright.dev/docs/test-webserver)
- [Playwright `baseURL`, traces, screenshots, video](https://playwright.dev/docs/test-use-options)
- [Playwright CLI and browser install](https://playwright.dev/docs/test-cli)
- [Deno testing](https://docs.deno.com/runtime/fundamentals/testing/)
- [Supabase local development & testing](https://supabase.com/docs/guides/local-development)
- [Zod docs](https://zod.dev/)
