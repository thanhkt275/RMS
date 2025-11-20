# /fix-build-errors Command

Automatically run **type-check + build** and fix all build errors for the **mentioned projects only** in a Bun monorepo with Turbo.

## Usage
```
/fix-build-errors @web @server @db [–strict] [–no-install] [–max-retries=3]
```

### Examples
```
/fix-build-errors @web
/fix-build-errors @web @server –strict –max-retries=2
/fix-build-errors @server @db –no-install
```

## Purpose
Ensure clean builds **only** for projects you specify (each prefixed with `@`) by:
- Enforcing **type-check** before bundling (TypeScript, Vite, Hono, Drizzle)
- Fixing common **TypeScript** errors
- Fixing **import/module/alias** issues (Vite aliases, tsconfig paths, workspace references)
- Installing/aligning **missing dependencies** (unless `--no-install`)
- Repairing **tsconfig / vite.config.ts / drizzle.config.ts** mismatches
- Syncing **workspace references** and monorepo dependencies
- Then re-running build until success or retries are exhausted.

> This prevents the situation where the editor shows TS errors but `bun run build` still passes due to lack of type-check.

## Process

### 1. **Detect Projects**
- Parse all `@project` arguments (e.g., `@web`, `@server`, `@db`, `@auth`).
- Map to actual workspace paths:
  - `@web` → `apps/web`
  - `@server` → `apps/server`
  - `@db` → `packages/db`
  - `@auth` → `packages/auth`
  - `@prisma` → `packages/prisma`
- Validate that each folder exists; skip invalid ones with a warning.

### 2. **Enforce Type-Check in Pipeline (idempotent)**

#### For each project:

**A. Ensure dev dependencies exist (install if missing, unless `--no-install`):**
- `typescript`
- `vite` (for web projects)
- `vitest` (for testing)
- `tsdown` (for server/packages)

**B. Create/update package.json scripts (per project):**
- Create/update:
  - `"typecheck": "tsc --noEmit"` (or `"tsc -b"` for composite projects)
  - If `--strict` is present, append ` --strict` to typecheck
- **Temporarily** add `"build:dev": "npm run typecheck && npm run build"` for type-checking
- Keep original `"build"` script unchanged

**C. Sync workspace references:**
- Ensure `tsconfig.json` has correct `references` array pointing to workspace packages
- Verify `paths` in `tsconfig.json` match actual workspace structure
- For Vite projects: verify `vite.config.ts` aliases match `tsconfig.json` paths

### 3. **First Pass: Type-Check**
- Run `bun run typecheck` in each project.
- Collect and categorize errors:
  - **Type Errors (TS)**: missing/incorrect types, type mismatches, etc.
  - **Import/Alias**: wrong paths, missing exports, tsconfig `paths` vs Vite alias mismatch.
  - **Module Resolution**: workspace reference issues, missing `@rms-modern/*` packages.
  - **Config**: `tsconfig`, `vite.config.ts`, `drizzle.config.ts` issues.
  - **Dependency**: missing packages or version conflicts.

### 4. **Auto-Fix**

#### **Type Errors:**
- Add/adjust types; prefer precise types over `any`.
- Fix type mismatches (e.g., `string | null` vs `string`).
- Ensure proper generic type parameters.
- Do not change business logic.

#### **Import/Alias Issues:**
- Correct import paths (e.g., `@rms-modern/auth` vs relative paths).
- Fix missing exports in source files.
- Sync `tsconfig.compilerOptions.paths` with Vite aliases.
- Ensure workspace package imports use correct package names.

#### **Module Resolution:**
- Verify workspace references in `tsconfig.json`.
- Ensure `moduleResolution` is set to `bundler` (for Vite/Bun compatibility).
- Fix path mismatches between `tsconfig.json` and actual file structure.

#### **Config Issues:**
- Repair `tsconfig.json` base/extends.
- Add missing `types` refs (e.g., `"types": ["bun"]` for Bun projects).
- Ensure `jsx` and `jsxImportSource` are correctly configured.
- Sync Vite aliases with tsconfig paths.

#### **Dependencies:**
- Add missing deps/devDeps (skip if `--no-install`).
- Use `bun add` or `bun add -d` for installation.
- Verify workspace dependencies use `workspace:*` protocol.

### 5. **Re-run Type-Check**
- Run `bun run typecheck` again in each project.
- If still failing, attempt targeted fixes once more (up to `--max-retries`, default `3`).
- Log remaining errors with file paths and line numbers.

### 6. **Run Build**
- After a passing type-check, run `bun run build` in each project.
- If build fails (non-type reasons), analyze & fix:
  - Vite/Hono plugin order or configuration
  - Env/config mismatch
  - Asset/path issues
  - Drizzle/database config issues
- Re-run build up to `--max-retries`.

### 7. **Cleanup Temporary Changes**
- **Remove** temporary `"build:dev"` script from package.json
- **Keep** only essential fixes: types, imports, config corrections, dependencies
- **Preserve** original build pipeline for production

### 8. **Reporting**
- ✅ Projects that now pass type-check **and** build.
- ⚠️ Projects still failing: list file paths, line numbers, and error excerpts.
- 📜 Summary of applied fixes:
  - Scripts updated
  - Config changes (tsconfig, vite.config.ts, etc.)
  - Alias/path sync
  - Types added/corrected
  - Dependencies added
- 🧹 Cleanup: removed temporary dev-only additions.

## Example Workflow

### Scenario: Fix @web and @server

```bash
/fix-build-errors @web @server –strict –max-retries=2
```

**Steps:**
1. Detect `apps/web` and `apps/server` as target projects.
2. Ensure TypeScript and build tools are installed.
3. Create `typecheck` scripts in both projects.
4. Run `bun run typecheck` in `apps/web`:
   - Error: `Cannot find module '@rms-modern/auth'`
   - Fix: Verify `tsconfig.json` paths and workspace references.
5. Run `bun run typecheck` in `apps/server`:
   - Error: `Type 'string' is not assignable to type 'Date'`
   - Fix: Add proper type annotations.
6. Re-run type-checks (pass).
7. Run `bun run build` in both projects (pass).
8. Remove temporary `build:dev` scripts.
9. Report: ✅ Both projects now build successfully.

## Philosophy
- **Type-first**: fail fast on TS errors before bundling.
- **Targeted**: only touch the projects you mention.
- **Safe**: don't change business logic; config/type/import-only fixes.
- **Repeatable**: idempotent updates to scripts/config; re-runnable anytime.
- **Clean**: automatically remove temporary dev-only additions after fixing.
- **Monorepo-aware**: understands Bun workspaces, Turbo, and workspace references.

## Output Format

Each run produces per-project:

```
📦 Project: @web (apps/web)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Type-Check Status: PASSED
✅ Build Status: PASSED

📝 Fixes Applied:
  • Updated tsconfig.json paths for @rms-modern/auth
  • Added missing type annotations in src/components/header.tsx:15
  • Synced Vite aliases with tsconfig paths

🧹 Cleanup:
  • Removed temporary "build:dev" script from package.json

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Project: @server (apps/server)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Type-Check Status: PASSED
✅ Build Status: PASSED

📝 Fixes Applied:
  • Added missing dependency: @rms-modern/db
  • Fixed import path in src/routes/tournaments/index.ts:8
  • Updated tsconfig.json composite references

🧹 Cleanup:
  • Removed temporary "build:dev" script from package.json

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ Summary:
  ✅ 2 projects passed type-check and build
  [object Object] Total fixes applied: 5
```

## Supported Project Types

- **@web** (Vite + React + TanStack Router)
- **@server** (Hono + Bun + Drizzle)
- **@db** (Drizzle ORM + SQLite)
- **@auth** (Better Auth + TypeScript)
- **@prisma** (Prisma ORM)
- Any other workspace package following the same TypeScript/Bun conventions

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--strict` | false | Enable strict type-checking with `--strict` flag |
| `--no-install` | false | Skip dependency installation |
| `--max-retries` | 3 | Maximum retry attempts for type-check and build |

## Tips

1. **Run after major code changes**: Use this command after significant refactoring or when adding new features.
2. **Use `--strict` for CI/CD**: Enforce strict type-checking in continuous integration.
3. **Combine with `bun install`**: Run `bun install` before this command if dependencies have changed.
4. **Check editor diagnostics**: If the editor shows errors but the command passes, restart the TypeScript server in your IDE.
