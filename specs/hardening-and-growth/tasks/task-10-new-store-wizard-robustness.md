# Task 10: Robust new-store wizard

## Status

complete

## Wave

1

## Description

`scripts/new-store.mjs` (with helpers in `scripts/new-store/`) fails for Arabic stores: `slugify` (~lines 44-51) strips everything non-Latin, so Arabic category labels fail validation and an all-Arabic store name yields an empty slug (hard failure with `--answers`). It deletes old brand assets (~lines 335-341) **before** the TypeScript check (~lines 404-410); if tsc fails, the restored `store.config.ts` points at deleted files. It accepts `http://` domains (~line 75). It does not record which template revision a copy came from, which makes deliberate per-copy upgrades (`docs/template-upgrades.md`) hard.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-24-accent-foreground-theme.md (also edits the wizard)

**Context from dependencies:** None.

## Files to Modify

- `scripts/new-store.mjs` — slug fallback, safe cleanup ordering, https enforcement, template version file.
- `scripts/new-store/*` — only if the relevant helpers live there.

## Files to Create

- `scripts/unit/new-store-slug.test.mjs` — tests for slug helpers (export them from a helper module if they are not exported; keep the CLI entry unchanged).

## Technical Details

1. **Slug fallback**: keep Latin slugify (NFKD, strip diacritics, `[^a-z0-9]+` → `-`). If the result is empty: for categories use `cat-<n>` (1-based index), for store slug use `store-<random 6 hex>` and print a French notice asking the user to confirm/override. Optionally transliterate basic Arabic letters with a small static map (ا→a, ب→b, ت→t, ث→th, ج→j, ح→h, خ→kh, د→d, ذ→dh, ر→r, ز→z, س→s, ش→sh, ص→s, ض→d, ط→t, ظ→z, ع→a, غ→gh, ف→f, ق→q, ك→k, ل→l, م→m, ن→n, ه→h, و→w, ي→y, ة→a, ى→a, ء→'' , أ/إ/آ→a) before falling back. Ensure uniqueness of category slugs (`-2`, `-3`).
2. **Cleanup ordering**: write new config/assets → run tsc → only on success delete obsolete brand assets. On failure restore the previous config **and** leave old assets untouched; print which files were restored.
3. **Domain**: require `https://` (or bare host → prefix `https://`); allow `http://localhost` only. Reject other `http://` with a French message.
4. **Template version**: write `.template-version` at repo root containing JSON `{ "template": "store-crm-boilerplate", "commit": "<git rev-parse HEAD or 'unknown'>", "createdAt": "<ISO>" }`. Use `execFileSync("git", ["rev-parse", "HEAD"])` with try/catch. Ensure `.template-version` is not ignored by `.gitignore` and is included by `scripts/release-tree.mjs` rules only if that script whitelists files (check; if the release tree must not contain it in the template itself, exclude it there — the template repo should not ship a `.template-version`; only generated copies have it).
5. Do not change the accent/contrast logic (task 24 owns it).

## Acceptance Criteria

- [ ] `npm run new-store -- --answers <json>` with an Arabic store name and Arabic categories completes with valid slugs.
- [ ] Forcing a tsc failure leaves the previous config and assets intact.
- [ ] `http://example.com` is rejected; `https://` accepted.
- [ ] `.template-version` is written in the generated copy.
- [ ] `node --test scripts/unit/new-store-slug.test.mjs` and `npm run test:release-tree` pass.

## Notes

Run the wizard only in a temporary copy of the repo (e.g. `git worktree add /tmp/wizard-test` or copy to `fs.mkdtempSync`), never against the working tree you are editing.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
