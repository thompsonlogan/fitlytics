# Fitlytics Frontend

React 19 SPA for the Fitlytics workout tracking app. Built with [Vite](https://vite.dev/), [TanStack Router](https://tanstack.com/router) + [Query](https://tanstack.com/query), [shadcn/ui](https://ui.shadcn.com/), and [Tailwind CSS v4](https://tailwindcss.com/).

## Prerequisites

- Node.js 20+
- pnpm
- Backend API running (for dev and API client generation)

## Getting started

```bash
pnpm install
pnpm dev           # starts Vite dev server at http://localhost:5173
```

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start Vite dev server with HMR |
| `pnpm build` | TypeScript check + production build |
| `pnpm preview` | Serve the production build locally |
| `pnpm test` | Run Vitest |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm test:cov` | Run Vitest with coverage |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm format` | Prettier (ts/tsx files) |
| `pnpm api_generate` | Regenerate typed API client from backend Swagger |

## Project structure

```
src/
  components/
    ui/             — shadcn/ui primitives (button, card, table, etc.)
    workout/        — Domain components (workout table, day selector, etc.)
  hooks/            — React hooks (auth, workout program, session, etc.)
  lib/              — Utilities, data transforms, program mappers
  routes/           — Route components (TanStack Router)
  services/
    generated/      — OpenAPI-generated typed API client (DO NOT EDIT)
    context.ts      — API client configuration
    data.ts         — Query functions / React Query keys
  test/             — Test setup, shared mocks
```

## API client generation

The frontend consumes a typed TypeScript client generated from the backend's Swagger spec. Regenerate it whenever backend handler doc comments or DTOs change:

```bash
# Backend API must be running on localhost:8080
pnpm api_generate
```

This runs the OpenAPI Generator via Docker (see `tools/docker-compose.yml`) and writes output to `src/services/generated/`. Do not hand-edit files in that directory.

## Testing

Tests use [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/).

```bash
pnpm test          # single run
pnpm test:watch    # watch mode
pnpm test:cov      # with coverage
```

Test files live alongside the code they test (`*.test.ts` / `*.test.tsx`).
