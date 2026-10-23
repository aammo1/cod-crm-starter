# Task 19: Automated, offsite, restore-verified backups

## Status

complete

## Wave

2

## Description

`scripts/backup-db.mjs` takes an online SQLite snapshot into the same volume (keeps 14), does not back up media (`data/uploads`), and scheduling/offsite copies are left to the operator (`docs/operations.md:140-147`). Nothing tests that a backup restores. Add media archiving, configurable retention, optional offsite push via rclone, a restore verifier, and ready-to-install schedule examples.

## Dependencies

**Depends on:** task-11-tooling-and-ci.md
**Blocks:** None

**Context from dependencies:** Task 11 added `test:unit` to `package.json` and owns CI; this task now owns `package.json` for adding scripts.

## Files to Create

- `scripts/verify-backup.mjs` — restore check.
- `deploy/backup/crm-backup.cron` — example crontab line.
- `deploy/backup/crm-backup.service`, `deploy/backup/crm-backup.timer` — systemd units (oneshot, `docker exec <container> node scripts/backup-db.mjs`).
- `scripts/unit/backup.test.mjs` — tests (temp dirs, no rclone).

## Files to Modify

- `scripts/backup-db.mjs`
- `package.json` — `"backup:verify": "node scripts/verify-backup.mjs"`.
- `Dockerfile` — only if needed so `scripts/verify-backup.mjs` is present in the image (check what the runtime stage copies; backup-db.mjs is already available as `node scripts/backup-db.mjs`).
- `scripts/release-tree.mjs` — only if it whitelists files and must include the new `deploy/` and script files.

## Technical Details

### backup-db.mjs

- Keep current behavior: online snapshot via better-sqlite3 `.backup()`, umask 077, files 0600, `wx` flags.
- Add `BACKUP_DIR` (default current), `BACKUP_RETENTION` (default 14).
- Media: create `uploads-<timestamp>.tar.gz` of `UPLOAD_DIR` using `tar -czf` via `execFileSync("tar", [...])` (available in the image? check base image; if not, implement with `node:zlib` + a minimal tar writer or skip with a warning). Apply the same retention.
- Write `manifest-<timestamp>.json` with sha256 of each artifact.
- Offsite: if `BACKUP_RCLONE_REMOTE` is set (e.g. `b2:my-bucket/store-x`), run `execFileSync("rclone", ["copy", file, remote], { stdio: "inherit" })` for each artifact + manifest. Credentials stay in rclone config/env (never in the script, never logged). If rclone is missing, exit non-zero with a clear French message.
- Exit non-zero on any failure (cron/systemd will surface it).

### verify-backup.mjs

- Args: path to a `.db` snapshot (default: newest in `BACKUP_DIR`).
- Copy to a temp dir, open read-only, run `PRAGMA integrity_check` (must be `ok`), `PRAGMA foreign_key_check` (must be empty), verify `_migrations` row count equals the number of files in `migrations/`, and count orders/products. Verify sha256 against the manifest if present. Print a French summary. Never touch the live DB.

### Tests

Create a temp DB with a couple of migrations applied (use `runMigrations` via `loadSource("@/lib/migrate")` or the db helper with a temp `DB_PATH`), run backup with `BACKUP_DIR`=temp and a temp `UPLOAD_DIR`, assert files, permissions (0600), retention pruning, and that verify passes; corrupt a copy → verify fails.

## Acceptance Criteria

- [ ] `npm run backup` produces DB snapshot, uploads archive and manifest; retention applies.
- [ ] `npm run backup:verify` passes on a fresh snapshot and fails on a corrupted one.
- [ ] Offsite push runs only when `BACKUP_RCLONE_REMOTE` is set.
- [ ] Unit tests pass without network.

## Notes

Operator steps (install timer, configure rclone remote) are in action-required.md; task 35 documents them in `docs/operations.md`.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
