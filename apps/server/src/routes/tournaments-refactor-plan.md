# Tournaments Routes Refactor Plan

This plan describes how to split the monolithic `tournaments.ts` route file into smaller, cohesive modules while preserving behavior.

## Goals

- Keep public API (URLs, methods, payloads) 100% backward compatible.
- Improve maintainability by grouping routes by domain (core, stages, matches, rankings, fields, resources, realtime).
- Centralize shared schemas, types, and helpers.
- Preserve existing auth, logging, and error-handling behavior.

---

## Step 1 – Analyze current `tournaments.ts`

1. Identify and annotate (mentally or via comments) logical groups of routes:
   - Tournament core (list, get, create, update, delete, filters, sorting, pagination).
   - Stages (CRUD, configuration, order, status transitions).
   - Matches (generation, updates, scheduling, scoring).
   - Rankings / leaderboard (stage rankings, tournament rankings).
   - Fields (field count, field roles assignments).
   - Resources (documents/links associated with tournaments).
   - Realtime / events (Redis subscriptions, stage events, etc.).
2. Identify shared Zod schemas and TS types (e.g., stage payload, match metadata, response DTOs).
3. Identify small, reusable helpers (e.g., `parseScoreData`, mapping DB rows to DTOs).

> Outcome: A clear mental map of which handlers belong to which domain.

### Findings (Step 1 Output)

- **Route groups & endpoints**

  - `GET /`, `POST /`, `PATCH /:identifier`, `GET /:identifier`, `POST /:identifier/register` → Tournament core CRUD, filtering, registration, resource aggregation.
  - `GET /admin/overview`, `GET /admin/staff` → Admin dashboards/staff directory.
  - `GET|PUT /:identifier/field-roles`, `GET /:slug/field-roles/users`, `GET /:slug/field-roles`, `POST /:slug/field-roles`, `DELETE /:slug/field-roles/:assignmentId` → Field count & staffing assignments.
  - `GET /:identifier/stages`, `GET /:identifier/stages/:stageId`, `POST /:identifier/stages`, `PATCH /:identifier/stages/:stageId`, `DELETE /:identifier/stages/:stageId` → Stage CRUD & metadata.
  - `GET /:identifier/stages/:stageId/leaderboard`, `GET /:identifier/stages/:stageId/matches`, `POST /:identifier/stages/:stageId/generate-matches`, `PATCH /:identifier/stages/:stageId/matches/:matchId`, `GET /matches/:matchId` → Match + leaderboard access & mutation.
  - `GET /:identifier/stages/:stageId/events` → Realtime SSE stream per stage (Redis-backed).
  - Helpers in the same file also cover tournament resources and score profiles but currently piggyback on tournament create/update endpoints rather than dedicated resource routes.

- **Shared schemas & types already present**

  - Zod schemas: tournament+stage payload/update schemas, match generation/update schemas, field role assignment/update schemas, score profile ID schema, enums for tournament/stage/match/resource statuses, ISO date validator, tournament resource schema.
  - TypeScript DTOs: Stage configuration/match metadata structures, stage/match/ranking row types, response DTOs for stages/matches/rankings, score data summaries, field-role DTOs.

- **Reusable helpers/utilities**
  - Serialization helpers: `formatMatchTeam`, `buildStageResponses`, `parseScoreData`, `parseStageConfigurationValue`, `parseMatchMetadata`.
  - Stage lifecycle helpers: `getStagesResponse`, `finalizeStageResponse`, `resolveStageOrder`, `createStageEntity`, `assignStageTeams`, `recalculateStageRankings`, `handleStageMatchPreparation`, `regenerateStageMatches`, `propagateMatchOutcome`, `ensureStageIsCompletable`, `enforceTeamRegenerationPolicy`.
  - Match generation helpers: `generateRoundRobinMatches`, `generateDoubleEliminationMatches`, `normalizeFieldCount`, `computeFieldNumber`, `createDefaultStageConfiguration`, `determineMatchOutcome`, `ensureScoresForCompletion`.
  - Field-role helpers: `fetchTournamentFieldAssignments`, `buildFieldRolesResponse`, `createEmptyFieldRoleState`, `createEmptyFieldRoleIdState`.
  - Misc query helpers: `getTournamentByIdentifier`, `resolveScoreProfileId`, `replaceTournamentResources`, `applyWhereClause`, `buildFilterClause`.

These findings confirm the logical seams for future file splits and highlight which definitions must move into shared `types.ts`, `schemas.ts`, or `utils.ts` modules before relocating route handlers.

---

## Step 2 – Create tournaments route module structure

Create a dedicated folder next to `tournaments.ts`:

- `apps/server/src/routes/tournaments/`

Inside it, create the following files (empty stubs at first):

- `index.ts` – root router that composes all sub-routers and exports the final `tournamentsRoute`.
- `tournament-core.routes.ts` – tournament-level CRUD, listing, filters, sorting.
- `stages.routes.ts` – stage CRUD, configuration, ordering, status.
- `matches.routes.ts` – match generation, updates, scheduling, scoring.
- `rankings.routes.ts` – rankings and leaderboard endpoints.
- `fields.routes.ts` – field count and field role assignment endpoints.
- `resources.routes.ts` – tournament resource CRUD.
- `events.routes.ts` (optional, if needed) – endpoints related to stage events / pub-sub.
- `schemas.ts` – Zod schemas shared across route modules.
- `types.ts` – shared TypeScript types (DTOs, configuration types, metadata types).
- `utils.ts` – reusable helpers specifically for tournament routes.

> Outcome: A clear, domain-based file structure ready to receive code.

---

## Step 3 – Extract shared types and schemas

1. In `tournaments.ts`, locate all **type** and **interface** definitions that are used across multiple groups, for example:
   - `StageMatchDependency`, `StageConfiguration`, `MatchMetadataSource`, `MatchMetadata`.
   - `StageRecord`, `StageTeamRow`, `StageMatchRow`, `StageRankingRow`.
   - `StageResponse`, `StageResponseTeam`, `StageResponseMatch`, `StageResponseRanking`.
   - `ScoreData`, `StageRankingMatchSummary`.
2. Move these types to `apps/server/src/routes/tournaments/types.ts`.
3. Export them from `types.ts` and adjust imports within route modules later.
4. In `tournaments.ts`, locate reusable Zod schemas, for example:
   - `tournamentStatusSchema`, `tournamentResourceTypeSchema`.
   - `isoDateSchema`, `tournamentResourceSchema`.
   - `stageStatusSchema`, `stageTypeSchema`, `matchStatusSchema`.
   - `stagePayloadSchema`, `stageUpdateSchema`, `matchGenerationSchema`, `matchUpdateSchema`.
   - `fieldRoleAssignmentSchema`, `fieldRoleUpdateSchema`, `scoreProfileIdSchema`.
5. Move these schemas into `apps/server/src/routes/tournaments/schemas.ts` and export them.
6. Keep very generic schemas (if any) in a more global shared location only if they truly belong to multiple route groups outside tournaments.

> Outcome: `types.ts` and `schemas.ts` contain all shared types and validation logic, with no duplicated definitions.

---

## Step 4 – Extract shared helpers

1. Find small helper functions that do not depend on specific route state, for example:
   - `parseScoreData`.
   - Functions that map DB rows to DTOs (e.g., stage/match/ranking -> API response objects) if present.
   - Any utility that is reused in more than one handler.
2. Move these helpers into `apps/server/src/routes/tournaments/utils.ts`.
3. Export them and update references later in the new route files.

> Outcome: A centralized place for tournaments-specific helpers.

---

## Step 5 – Create and wire the root tournaments router

1. In `apps/server/src/routes/tournaments/index.ts`:
   - Import `Hono`.
   - Create a root router: `const tournamentsRoute = new Hono();`.
   - For now, export `tournamentsRoute` empty: `export { tournamentsRoute };`.
2. Later, this file will `route` or `use` sub-routers (core, stages, matches, etc.).
3. Update wherever `tournaments.ts` is imported to instead import from `tournaments/index.ts` once the migration is complete (or temporarily re-export from `tournaments.ts`).

> Outcome: An entrypoint to which all domain routers will attach.

---

## Step 6 – Migrate tournament core routes

1. Create `apps/server/src/routes/tournaments/tournament-core.routes.ts`.
2. Add:
   - `const tournamentCoreRoute = new Hono();`
   - Move handlers managing:
     - List tournaments with filters, sorting, pagination.
     - Get a single tournament by ID.
     - Create a tournament.
     - Update a tournament (status, metadata, configuration).
     - Delete or archive a tournament, if applicable.
3. Ensure imports:
   - `auth` middleware.
   - `db`, `tournaments`, `tournamentStatuses`, etc.
   - Schemas/types from `schemas.ts` and `types.ts` if needed.
4. Preserve identical paths and HTTP verbs (e.g., `GET /tournaments`, `POST /tournaments`, `GET /tournaments/:id`, etc.).
5. Export `tournamentCoreRoute`.
6. In `index.ts`, mount the core router:
   - `tournamentsRoute.route("/", tournamentCoreRoute);`

> Outcome: Tournament core endpoints live in a dedicated module and are reachable through the root router.

---

## Step 7 – Migrate stages routes

1. Create `apps/server/src/routes/tournaments/stages.routes.ts`.
2. Add:
   - `const stagesRoute = new Hono();`
   - Move all handlers whose paths involve stage operations, e.g.:
     - `POST /tournaments/:tournamentId/stages`.
     - `GET /tournaments/:tournamentId/stages`.
     - `GET /tournaments/:tournamentId/stages/:stageId`.
     - `PATCH /tournaments/:tournamentId/stages/:stageId`.
     - Any endpoints that update stage configuration, order, or status.
3. Use types and schemas from `types.ts` and `schemas.ts`:
   - `StageConfiguration`, `StageResponse`, etc.
   - `stagePayloadSchema`, `stageUpdateSchema`.
4. Ensure any stage-related DB queries (using `tournamentStages`, `tournamentStageTeams`, `tournamentStageStatuses`, etc.) moved along with their handlers.
5. Export `stagesRoute`.
6. Mount in `index.ts`:
   - `tournamentsRoute.route("/", stagesRoute);`

> Outcome: Stage-related logic is isolated into `stages.routes.ts` with shared types and schemas.

---

## Step 8 – Migrate matches routes

1. Create `apps/server/src/routes/tournaments/matches.routes.ts`.
2. Add:
   - `const matchesRoute = new Hono();`
   - Move endpoints for match management:
     - Match generation for a stage or tournament.
     - Updating match scores, status, schedule.
     - Any match-specific operations like rescheduling, cancellation, etc.
3. Reuse types and schemas:
   - `MatchMetadata`, `StageMatchRow`, `StageResponseMatch`.
   - `matchGenerationSchema`, `matchUpdateSchema`.
   - `matchStatuses`, `matchStatusSchema`.
4. Move match scheduling logic that uses `buildMatchSchedule`, `MatchScheduleMetadata`, and `ScheduledSlot` but keep the scheduler itself in `utils/match-scheduler.ts` (it’s already a separate utility).
5. Export `matchesRoute`.
6. Mount in `index.ts`:
   - `tournamentsRoute.route("/", matchesRoute);`

> Outcome: Match operations are separated into their own router, referencing shared utilities and types.

---

## Step 9 – Migrate rankings and leaderboard routes

1. Create `apps/server/src/routes/tournaments/rankings.routes.ts`.
2. Add:
   - `const rankingsRoute = new Hono();`
   - Move endpoints that deal with rankings and leaderboards, e.g.:
     - Get stage rankings.
     - Get tournament rankings.
     - Any endpoints that trigger leaderboard sync.
3. Use services from `../services/leaderboard`:
   - `fetchStageLeaderboardRows`, `readStageLeaderboardOrder`, `syncStageLeaderboard`.
4. Use `StageRankingRow`, `StageResponseRanking`, `ScoreData`, and `parseScoreData` from `types.ts` / `utils.ts`.
5. Export `rankingsRoute`.
6. Mount in `index.ts`:
   - `tournamentsRoute.route("/", rankingsRoute);`

> Outcome: Ranking and leaderboard logic is isolated and easier to reason about.

---

## Step 10 – Migrate fields routes

1. Create `apps/server/src/routes/tournaments/fields.routes.ts`.
2. Add:
   - `const fieldsRoute = new Hono();`
   - Move endpoints that manage:
     - Tournament field count.
     - Field assignments and roles (e.g. `tournamentFieldAssignments`, `tournamentFieldRoles`).
3. Use `FieldAssignmentRow`, `FieldRoleUser`, `FieldRoleField` types.
4. Use schemas `fieldRoleAssignmentSchema`, `fieldRoleUpdateSchema`.
5. Export `fieldsRoute`.
6. Mount in `index.ts`:
   - `tournamentsRoute.route("/", fieldsRoute);`

> Outcome: All field/role related logic is separated from core tournament/stage/match concerns.

---

## Step 11 – Migrate resources routes

1. Create `apps/server/src/routes/tournaments/resources.routes.ts`.
2. Add:
   - `const resourcesRoute = new Hono();`
   - Move endpoints that manage `tournamentResources` and `tournamentResourceTypes`, e.g.:
     - Create, update, delete resources for a tournament.
     - List resources.
3. Use `tournamentResourceSchema` and `tournamentResourceTypeSchema` from `schemas.ts`.
4. Export `resourcesRoute`.
5. Mount in `index.ts`:
   - `tournamentsRoute.route("/", resourcesRoute);`

> Outcome: Resource-related endpoints are isolated for easier maintenance and extension.

---

## Step 12 – Migrate realtime/events routes (if any)

1. Create `apps/server/src/routes/tournaments/events.routes.ts` if the API exposes endpoints that:
   - Trigger stage events.
   - Interact directly with `publishStageEvent` or `createRedisSubscriber`.
2. Move these handlers into the new file:
   - Import `getStageEventChannel`, `publishStageEvent`, `StageEventPayload` as needed.
3. Export `eventsRoute` and mount it in `index.ts`:
   - `tournamentsRoute.route("/", eventsRoute);`

> Outcome: Event-related endpoints are clearly separated from core REST-like operations.

---

## Step 13 – Finalize `index.ts` router composition

1. In `apps/server/src/routes/tournaments/index.ts`, import all sub-routers:
   - `tournamentCoreRoute`, `stagesRoute`, `matchesRoute`, `rankingsRoute`, `fieldsRoute`, `resourcesRoute`, `eventsRoute` (if created).
2. Compose them on the root router using `route` or `use`:

   ```ts
   const tournamentsRoute = new Hono();

   tournamentsRoute.route("/", tournamentCoreRoute);
   tournamentsRoute.route("/", stagesRoute);
   tournamentsRoute.route("/", matchesRoute);
   tournamentsRoute.route("/", rankingsRoute);
   tournamentsRoute.route("/", fieldsRoute);
   tournamentsRoute.route("/", resourcesRoute);
   tournamentsRoute.route("/", eventsRoute);

   export { tournamentsRoute };
   ```

3. Ensure any common middleware (auth, logging, CORS) that should apply to all tournaments endpoints is either:
   - Applied at a higher level (where `tournamentsRoute` is mounted), or
   - Registered once in `index.ts` before mounting routes.

> Outcome: Single, cohesive router for tournaments that internally delegates to domain routers.

---

## Step 14 – Replace old `tournaments.ts`

1. After all handlers have been moved and imports updated:

   - Option A: Replace `apps/server/src/routes/tournaments.ts` with a tiny re-export:

     ```ts
     export { tournamentsRoute } from "./tournaments";
     ```

   - Option B: Delete `tournaments.ts` and update all imports elsewhere in the codebase to `./tournaments` (or appropriate relative path).

2. Use `grep` or your IDE search to ensure no remaining references to the old file path.

> Outcome: No business logic remains in the original monolithic file.

---

## Step 15 – Run checks and tests

1. Run type checking and linting from the repo root:

   ```bash
   cd apps/server
   pnpm lint || npm run lint || bun lint
   ```

2. Run project-wide Biome/Ultracite checks:

   ```bash
   npx ultracite check
   npx ultracite fix
   ```

3. Run any API or integration tests targeting tournament endpoints (if available):

   ```bash
   pnpm test || npm test || bun test
   ```

> Outcome: Confirm that the refactor did not change runtime behavior.

---

## Step 16 – Optional refinements

1. Evaluate if any route modules are still too large and consider further splitting by:
   - Read-only vs. mutating operations.
   - Public vs. admin/protected endpoints.
2. Consider extracting a `tournaments/service` layer for complex business logic, leaving route modules as thin HTTP adapters.
3. Add minimal unit tests or integration tests focused on the most complex pieces (e.g., match generation, schedule building, rankings).

> Outcome: A clean, extensible tournaments routing layer aligned with best practices.
