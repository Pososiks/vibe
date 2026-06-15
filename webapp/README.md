# Webapp

The CSR browser client provides the baseline auth flow for future app features. It lives behind authentication and needs no SEO, so it stays client-side rendered; the public, SEO-facing surfaces live in the `website` workspace instead. It talks to Supabase directly (Postgres + Auth + RLS) and shares Zod contracts with the rest of the workspace, keeping server-state, form-state, and auth behavior centralized.

## Project Surface Status

This section may be updated during first-run bootstrap. If the root `README.md` marks webapp as deferred, add a short note here explaining that browser work is intentionally paused. When the user activates webapp, remove or rewrite that note before starting browser development.

## Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Radix UI
- TanStack Query
- TanStack Form
- TanStack Router
- Zod contracts from `@web-app-demo/contracts`
- shadcn CLI
- Playwright
- ESLint

## Commands

```bash
bun run dev
bun run build
bun run typecheck
bun run lint
bun run test
bun run e2e
bun run e2e:ui
bun run ui:info
```

From the repository root, use `bun run dev:webapp`, `bun run build:webapp`, `bun run typecheck:webapp`, `bun run test:webapp`, and `bun run e2e:webapp`.

## Env

Create `webapp/.env` when needed:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

These are build-time config that point the browser bundle at your Supabase project. In production they must be concrete values for the target project; if they change, redeploy so the built bundle stops using the old values. The anon key is safe to ship to the client because access is enforced by Supabase Row Level Security; never put the service role key here.

## Deploy (Vercel)

Deploy the browser app as its own Vercel project with Root Directory `webapp` and framework preset Vite. Set the build environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The committed `webapp/vercel.json` provides the SPA rewrite so client-side routes resolve to `index.html`.

## Practice

Use TanStack Query for server state, TanStack Form for forms, and shared Zod schemas from `packages/contracts` for validation. Sessions are issued and refreshed by Supabase Auth; the Supabase client owns token storage and refresh.

Keep the Supabase client responsible for auth, session handling, and request/error parsing. Do not duplicate data shapes or auth state in page components.

Use shadcn/ui for web interface primitives. Treat `src/components/ui` as the shared UI primitive layer: most files are shadcn registry output, plus project-wide primitives such as `Typography`. Import those primitives through `@/components/ui/*`. Put app-specific wrappers and composed product components in `src/components` so normal lint rules keep applying. Avoid adding new one-off global CSS classes for product UI; compose screens with Tailwind utilities and shadcn theme tokens from `src/index.css`.

All web typography must go through `src/components/ui/typography.tsx`. Use `Typography` for page copy, headings `h1` through `h6`, labels, controls, captions, emphasis, shortcuts, code/kbd text, and screen-reader-only text. Do not add raw heading/paragraph/emphasis elements or Tailwind text-size/font/leading/tracking utilities in pages or UI components; the local ESLint typography policy enforces this.

The current shadcn configuration is `radix-maia` with the `hugeicons` icon library and CSS variables, as recorded in `components.json`. This template intentionally includes the full official shadcn component registry from `bunx shadcn@latest add --all -c webapp` so future projects can start from a complete local UI foundation. Do not add community registries, blocks, or custom UI generator output unless the product asks for them.

When adding or refreshing shadcn components:

```bash
bun run --cwd webapp ui:info
bun run --cwd webapp ui:add -- <component>
```

Use the local `shadcn` devDependency pinned in `webapp/package.json` and `bun.lock`; do not use `shadcn@latest` for routine refreshes because it can produce registry output that no longer matches this template. If generated files need compatibility fixes for current package versions, keep the edits small and leave app-specific composition outside `src/components/ui`.

## E2E

Playwright runs the browser smoke flow against a real Supabase project. The suite covers client-side auth validation visibility, protected UI, and the signed-in path. Seeding the authenticated flow needs `SUPABASE_SERVICE_ROLE_KEY` in the environment; without it that spec is skipped so the rest of the suite still runs.

```bash
bun run e2e:install
bun run e2e:webapp
```

Detailed runbook: [../docs/TESTING.md](../docs/TESTING.md).

## Current Upstream Documentation

For browser framework, routing, forms, server-state, build, lint, or E2E questions, consult the current upstream documentation linked here first. This README describes this app's conventions; upstream docs are authoritative for library behavior.

- [React docs](https://react.dev/reference/react)
- [Vite guide](https://vite.dev/guide/)
- [Tailwind CSS docs](https://tailwindcss.com/docs)
- [shadcn/ui docs](https://ui.shadcn.com/docs)
- [Radix UI docs](https://www.radix-ui.com/primitives/docs/overview/introduction)
- [TanStack Query React docs](https://tanstack.com/query/latest/docs/framework/react/overview)
- [TanStack Form React docs](https://tanstack.com/form/latest/docs/framework/react/quick-start)
- [TanStack Router docs](https://tanstack.com/router/latest/docs/overview)
- [Zod docs](https://zod.dev/)
- [Playwright docs](https://playwright.dev/docs/intro)
- [ESLint docs](https://eslint.org/docs/latest/)
