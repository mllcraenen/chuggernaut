# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

Chuggernaut is a standalone Next.js app for tracking a 6-week powerlifting program ("Monolith Meet Prep v7", see `lib/workout-program.ts`). It was extracted from a sibling project (`tools-portal`) and shares that project's stack, auth pattern, and SQLite conventions, running as a separate Docker container on port 3003. The workout-code fork that used to live inside tools-portal was deleted (2026-07-07) — **this repo is the only workout app**. DB is `/home/admin/data/workout.db` (`WORKOUT_DB_PATH` in docker-compose).

**The public URL is `https://tools.marijncraenen.nl/tools/workout`** — Caddy (`/etc/caddy/Caddyfile`) has a `handle /tools/workout*` directive in the `tools.marijncraenen.nl` block proxying to port 3003, ahead of the catch-all to tools-portal. The app is built with Next.js `basePath: "/tools/workout"`; `lib/base-path.ts` is the single source of truth, and client-side `fetch()` calls must go through its `apiUrl()` helper because basePath is not applied to fetch. `AUTH_URL` in `.env` stays origin-only (`https://tools.marijncraenen.nl`) — Auth.js sees basePath-stripped paths — and `signIn`/`signOut` `redirectTo` values need the explicit `BASE_PATH` prefix. **No change counts as live until it is testable at that public URL**; `localhost:3003` checks alone do not count.

## Commands

```bash
npm run dev              # dev server (http://localhost:3000)
npm run build             # production build — must pass with 0 errors
npm run lint               # eslint
npm test                    # vitest run (single pass)
npm run test:watch     # vitest watch mode
npx vitest run __tests__/workout-sheets.test.ts   # single test file
npx vitest run -t "test name substring"            # single test by name
docker compose up -d --build       # rebuild and deploy (port 3003)
docker compose logs chuggernaut --tail=30
```

Test the Sheets export/import without going through the UI/auth:
```bash
curl -s -H "X-Internal-Token: chuggernaut-internal" "http://localhost:3003/tools/workout/api/internal/sync?action=export"
curl -s -H "X-Internal-Token: chuggernaut-internal" "http://localhost:3003/tools/workout/api/internal/sync?action=import"
```

The program-swap test fallout (ROADMAP.md Phase 1) is fixed: the suite passes with program-agnostic assertions. Keep new tests structural — derive expectations from `lib/workout-program.ts` rather than hardcoding exercise names or block layouts.

## Architecture

**Auth.** `auth.ts` is a single hardcoded-credentials Auth.js (next-auth v5 beta) provider — one username/password pair from env vars, JWT session, no database-backed users. `middleware.ts` gates every route except `/login`, `/api/auth`, and `/api/internal` (see below).

**Data layer (`lib/workout-db.ts`).** A single `node:sqlite` (`DatabaseSync`, no native deps) connection, opened lazily on first `getDb()` call so importing the module never touches the filesystem at build/import time. The full schema lives in one `SCHEMA` string run as `CREATE TABLE IF NOT EXISTS` on every startup — this is what makes both fresh installs and in-place upgrades work. **Whenever you add a table or column used by `lib/workout.ts`, you must add it to `SCHEMA` in the same change**, or production will throw `no such table` on a real DB that never gets `DROP`/recreated. DB path is `WORKOUT_DB_PATH` env var (default `/home/admin/data/workout.db`); tests override it by setting the env var *before* importing `lib/workout-db` (see the `vi.hoisted(...)` pattern in `__tests__/body-weight.test.ts`, or the `vi.resetModules()` pattern in `__tests__/notes.test.ts`).

**Domain logic (`lib/workout.ts`).** All reads/writes to the DB funnel through this one file: training maxes, sessions, sets, swaps, notes, body weight, goal date. It computes `e1rm` (Epley formula) and training max (`e1rm × 0.88`, `TM_FACTOR`) itself rather than trusting client input. Anything that mutates state calls `markDirty()` (from `lib/sheets-sync.ts`) to flag the Sheets export as due.

**Program definition (`lib/workout-program.ts`).** A static, hand-authored `ProgramDay[]` describing every week/day/exercise/set of the 6-week block, with `percentOfTM` (whole-number percentage) rather than absolute weights — actual prescribed weight is computed at render/export time against the lifter's current training max. This file is data, not config — edits change the program itself.

**Google Sheets bidirectional sync** is the most involved subsystem, split across three files:
- `lib/sheet-writer.ts` — `WorkoutSheetWriter`, a pure class (program + training maxes + logged sets in, spreadsheet `Row[]` out) with no I/O. Each block tab is a flat list of set-rows with a hidden `_key` column (`week|day|setNumber|exercise`) that makes parsing a pasted-back sheet unambiguous without positional guessing. Separator/header rows have an empty key and are skipped on import. Fully unit-testable without touching Google's API.
- `lib/workout-sheets.ts` — wires `WorkoutSheetWriter` to the DB and the `googleapis` Sheets v4 client. The `SheetsApi` interface is a minimal structural type so tests can inject a fake client (see `__tests__/workout-sheets.test.ts`) instead of hitting the network. `googleapis` itself is dynamically imported inside `getSheetsContext()` so the (heavy) dependency is never loaded unless sync is actually configured. Credentials (a Google service-account JSON) and spreadsheet ID live in the `workout_settings` key/value table, not env vars.
- `lib/sheets-sync.ts` — a one-bit "dirty" flag in `workout_settings` plus debounce/staleness helpers (`triggerExportIfDue`, called fire-and-forget after writes with a 60s debounce; `importIfStale`, called from the `/workout` server component and imports if the last import is >15min old). Both are designed to never throw into the request path — export failures re-set the dirty flag instead of surfacing an error, import failures are swallowed so a Sheets outage never breaks page render.

Tabs are block tabs (one per 4-week block, generated from `CB16_BLOCKS`/`BlockDefinition[]`) plus fixed non-block tabs for Training Maxes, Body Weight, and Swaps (`TAB_HEADERS`). `WorkoutSheetWriter` takes `BlockDefinition[]` as a constructor arg, so a different program's block layout can reuse the same writer.

**Internal sync route (`app/api/internal/sync/route.ts`)** bypasses Auth.js entirely via a hardcoded `X-Internal-Token` header check — this is safe only because Caddy returns 403 for `/tools/workout/api/internal*` before proxying (see `/etc/caddy/Caddyfile`) — the route is reachable only via `localhost:3003` on the VPS. `middleware.ts` explicitly excludes `/api/internal` from the auth gate for this reason.

**Client/server split for sessions.** `app/workout/session/[week]/[day]/page.tsx` (server) resolves program data, swaps, notes, and previous-session numbers, then hands a plain-data props object to `components/workout/session-client.tsx` ("use client") which owns all interactive logging state, unit conversion (`lib/units.ts`, kg is canonical storage unit, lbs is display-only via `UnitProvider`/`unit-context.tsx`), and plate math (`lib/plate-calculator.ts`).

**Autoregulation (`lib/autoregulation.ts`).** Pure functions, no DB access: a standard RPE table backs out an implied training max per lift from prescribed-vs-reported RPE on logged sets, weighted toward the top set, damped (0.6) and capped (±5 %/session). Post-session, `components/workout/autoregulate-sheet.tsx` presents the suggestions for explicit approval; applied changes are tagged in a JSON log under the `workout_settings` key `tm_autoregulation_log`.

**Exercise swaps** (`lib/exercise-alternatives.ts` for suggested alternatives, `workout_swaps` table via `createSwap`/`getActiveSwap`/`clearSwap`) let a lifter substitute an exercise for either a single day or the rest of a block; `getSwapsForSession` resolves which swap (if any) applies to a given week/day/exercise at read time — the program definition itself is never mutated.

**Warmups** (`lib/warmup-routines.ts`) are keyed by the program day's `label` string (e.g. "Squat Focus") and are purely ephemeral UI (preview screen checklist) — nothing warmup-related is persisted to the DB.
