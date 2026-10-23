# Task 17: Logout revokes the session; admins can sign out everywhere

## Status

complete

## Wave

2

## Description

Logout calls `signOut` without bumping `users.session_version` (`src/app/(admin)/crm/layout.tsx:33-36` and the admin layout), so a copied JWT stays valid up to 7 days after logout. The team service (`src/lib/services/team.ts`) manages agents only; a compromised admin can only be revoked with `scripts/create-user.mjs`. Role, active state and `session_version` are already re-read from the DB on every request, so bumping the version is sufficient to revoke.

## Dependencies

**Depends on:** task-06-request-body-limits-and-upload-reencode.md
**Blocks:** None

**Context from dependencies:** Task 06 converted `src/app/api/crm/team/route.ts`, `src/app/api/crm/team/[id]/route.ts` and `.../password/route.ts` to `readLimitedJson(request, 16 * 1024)`; keep that.

## Files to Create

- `src/app/api/crm/team/[id]/sessions/route.ts` — `DELETE` revokes all sessions of a user (admin only; an admin may target themselves or an agent; targeting another admin allowed too).
- `src/app/api/crm/session/route.ts` — `DELETE` "log out everywhere" for the current user.

## Files to Modify

- `src/lib/services/team.ts` — `revokeSessions(userId)` incrementing `session_version` (and for admins too).
- `src/app/(admin)/crm/layout.tsx`, `src/app/(admin)/admin/layout.tsx` — the logout server action bumps the current user's `session_version` before `signOut`.
- `src/components/crm/team-workspace.tsx` — `Déconnecter partout` button per member, and for the current admin a `Me déconnecter de tous les appareils` action.

## Technical Details

- Read the auth setup (search `session_version` / `sessionVersion` in `src/auth*`, `src/lib/auth-guards.ts`, `src/lib/services/credentials.ts`) to confirm the JWT carries `sessionVersion` and requests compare it to the DB.
- Server actions must still pass the existing origin checks; routes use `requireAdmin` / `requireUser` from `src/lib/auth-guards.ts`.
- `revokeSessions` is a single `UPDATE users SET session_version = session_version + 1 WHERE id = ?`.
- Self-revocation via the route should respond 204 and the client redirects to `/login`.
- French copy; confirm dialogs.

## Acceptance Criteria

- [ ] After logout, replaying the old session cookie gets redirected to login (test in `scripts/security-workflow.test.mjs` by bumping version and calling the guard).
- [ ] Admin can revoke any user's sessions; agent cannot call the team route.
- [ ] `npm run test:security` passes.
## Project Rules (apply to every task)

- Read `AGENTS.md` at the repo root first; its invariants override anything here.
- Finish with `npm run lint` and `npx tsc --noEmit` passing, plus the tests named in this task.
- Tests: `DELIVERY_PROVIDER=mock`, temp `DB_PATH` (`fs.mkdtempSync`), ephemeral secrets, and `NODE_OPTIONS=--import=$PWD/scripts/block-external-network.mjs`. New unit tests go in `scripts/unit/<name>.test.mjs` and load TS with `import { loadSource } from "../test-source.mjs"`; run them with `node --test scripts/unit/<name>.test.mjs`.
- CRM/admin copy is French. Storefront copy comes from `store.config.ts` / `src/config/i18n.ts` (both `fr` and `ar`). Prices are integer MAD. Timezone Africa/Casablanca.
- Never edit an applied migration. Never load `.env*` files or call live couriers. Do not commit.
