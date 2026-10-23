# Task 03: Harden the migration runner

## Status

complete

## Wave

1

## Description

`src/lib/migrate.ts` swallows SQLite errors matching `/already exists|duplicate column/i` and records the file as applied. Each file already runs inside one transaction, so partial application cannot happen; the swallow only hides buggy new migrations or drifted schemas. It also splits SQL naively on lines ending in `;` (triggers in `010_meta_events.sql` and `019_tiktok_events.sql` only work because of formatting), and stores no checksum, so edits to applied files go unnoticed — violating the "never rewrite applied SQL" rule.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None.

## Files to Create

- `scripts/unit/migrate.test.mjs` — runner tests using temp dirs.

## Files to Modify

- `src/lib/migrate.ts` — remove the swallow and splitter; execute each file with `db.exec(sql)` inside `db.transaction`; add checksums.

## Technical Details

### Implementation Steps

1. Delete `ALREADY_APPLIED` and `splitStatements`. Run `db.exec(sql)` for the whole file inside the existing per-file transaction, then insert the `_migrations` row. (better-sqlite3 `exec` handles multiple statements and triggers correctly.)
2. Checksums: after `CREATE TABLE IF NOT EXISTS _migrations`, add a `checksum TEXT` column if missing (inspect `PRAGMA table_info(_migrations)`; `ALTER TABLE _migrations ADD COLUMN checksum TEXT`). This is runner-owned metadata, not a migration file.
3. Compute `sha256` (hex) of each file's exact bytes with `node:crypto`.
4. For applied rows with `checksum IS NULL` (existing DBs), backfill the current checksum (trust on first use).
5. For applied rows whose checksum differs from the file, throw `Error("Migration <name> modifiée après application (checksum différent). Restaurez le fichier d'origine.")`. Escape hatch: env `MIGRATIONS_ALLOW_CHECKSUM_MISMATCH=1` logs a warning instead (for deliberate, documented recovery only).
6. Make `runMigrations` accept an optional `dir` parameter (default `path.join(process.cwd(), "migrations")`) so tests can point at a temp folder. Keep the existing call sites working unchanged.
7. Error message on failure must include the file name.

### Tests (scripts/unit/migrate.test.mjs)

Use a temp DB (`new Database(tmpfile)` via `loadSource("better-sqlite3")` or plain import) and a temp migrations dir:
- A file with a trigger whose body has `;` at line end inside `BEGIN … END;` applies correctly.
- A file with a string literal containing `';\n'` applies correctly.
- A failing statement (duplicate column) aborts, rolls back the whole file and records nothing.
- Editing an applied file → next run throws checksum error; with `MIGRATIONS_ALLOW_CHECKSUM_MISMATCH=1` it warns.
- Existing rows with NULL checksum get backfilled.
- Also apply the real `migrations/` folder to a fresh DB successfully.

## Acceptance Criteria

- [ ] No error swallowing remains.
- [ ] All 19 existing migrations still apply on a fresh DB (`npm run test:crm`, `npm run test:bootstrap` after build).
- [ ] Checksum mismatch is detected.
- [ ] `node --test scripts/unit/migrate.test.mjs` passes.

## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
