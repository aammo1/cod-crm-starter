# Action Required: Standalone COD CRM Starter

## Before Implementation

No manual prerequisite is currently blocking implementation. The owner approved **public** `aammo1/cod-crm-starter`; GitHub authentication was available during planning. Workspace creation, extraction, repository creation, push and template enablement can be performed by the implementation agent.

## During Implementation

- [ ] **Resolve a workspace/repository name collision if encountered** — if `/home/tal7a/Projects/cod-crm-starter` or `aammo1/cod-crm-starter` already contains unrelated work, the agent must report it rather than overwrite it or select another destination silently.
- [ ] **Restore GitHub authentication only if required** — run `gh auth login` locally if credentials have expired or lack repository creation/template permissions. Never paste tokens into the spec or chat.

## After Implementation

These actions are per-store production onboarding; they do not block publishing or local mock verification.

- [ ] **Create a store from the template** — choose its own repository name and hosting destination. Template copies are independent; later starter updates need deliberate application.
- [ ] **Provide production domains/DNS** — select CRM and storefront domains and configure HTTPS/routing with the chosen host.
- [ ] **Supply unique runtime secrets** — generate separate `AUTH_SECRET`, `STOREFRONT_API_KEY` and optional `CATALOG_AGENT_KEY` per deployment; set matching server-only client credentials on the associated storefront.
- [ ] **Provide the store's Ozon account details** — populate courier credentials in the deployment secret manager; validate actual status mappings through the established read-only owner-gated process before enabling live operations.
- [ ] **Configure persistent storage/backups** — independent SQLite/media volume per store; arrange backup scheduling and off-host retention.
- [ ] **Set store rules and initial catalog/stock** — set display name, delivery/upsell rules, create the first admin using the documented CLI, and add products/opening stock through CRM services.
- [ ] **Connect and verify the real storefront** — use the client/example guide; verify its checkout/upsell journey against staging before accepting live orders.
- [ ] **Optional services** — provide Meta/assistant credentials only for stores using those capabilities.

Repository creation, enabling the template flag, mock verification and documentation are agent implementation tasks, not manual owner chores.
