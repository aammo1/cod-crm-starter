# Action Required: Hardening and Growth

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **Decide the production proxy IP header** (e.g. `X-Forwarded-For` behind Traefik/Coolify, `CF-Connecting-IP` behind Cloudflare) — task 04/16 make `SECURITY_TRUSTED_IP_HEADER` (or an explicit opt-out) mandatory in production.
- [ ] **Choose a second courier (optional, future spec)** — e.g. Amana, Cathedis, Sendit, Forcelog; obtain its API docs and sandbox credentials. Out of scope here.

## During Implementation

- [ ] **Pin GitHub Actions by commit SHA** — task 11 cannot resolve SHAs offline; replace `@v4` tags with SHAs (or let Dependabot do it) after the task lands.
- [ ] **Provide an Ozon remittance statement sample (redacted)** — helps confirm default CSV column names for task 27's import (column mapping stays configurable).

## After Implementation

- [ ] **Set new production env vars on each live store** — `DELIVERY_PROVIDER` (now required in production), `SECURITY_TRUSTED_IP_HEADER` or `SECURITY_ACCEPT_GLOBAL_BUDGETS=1`, optional `HEALTH_DETAILS_TOKEN`, `BACKUP_*` (see `docs/operations.md`).
- [ ] **Schedule backups and offsite copy** — install the cron/systemd example from task 19 and configure an rclone remote; run `npm run backup:verify` once to prove restore.
- [ ] **Verify Ozon tracking statuses live** — record observed raw strings in `src/lib/shipping/status-map.ts` (owner-authorized, separate change) so outcomes become automatic.
- [ ] **Enter product cost prices and daily ad spend** — needed for profit/ROAS on the dashboard.
- [ ] **Review the consent banner copy with a legal advisor (CNDP / loi 09-08)** — task 33 ships neutral defaults.
- [ ] **Add a Snap Pixel ID in `store.config.ts`** if you advertise on Snapchat.
- [ ] **Apply these upgrades deliberately to existing store copies** per `docs/template-upgrades.md` (migrations 020–027 included).

---

> These tasks are also referenced in context within the relevant task files.
