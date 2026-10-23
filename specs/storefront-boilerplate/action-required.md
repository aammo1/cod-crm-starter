# Action Required: Storefront Boilerplate

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **Decide the first real niche** (name, domain, locale, colours, logo file). Task 10's wizard is easiest to validate against a real store rather than placeholders.
- [ ] **Have a TikTok Events API access token and pixel code ready** (TikTok Ads Manager → Events → Web events → Settings → Generate access token). Implementation uses only mocks, but you'll need these to verify live.

## During Implementation

- [ ] **Capture real Ozon tracking statuses** for task 16. With a live Ozon account, run `node scripts/ozon-verify.mjs` (or note the statuses from the Ozon portal) for parcels in each state: delivered, refused, cancelled, returned, in transit, at a facility, out for delivery. Save the raw status strings and what each one means to `docs/ozon-status-samples.md`. Task 16 is blocked until this file exists.
- [ ] **Confirm the phone format Ozon accepts** (`06XXXXXXXX` vs `+2126…`) by creating one real test parcel. Record the result in the same file.

## After Implementation

- [ ] **Cloudflare**: add the domain, set the proxy to orange cloud, SSL to Full (strict), and add the cache rules from `docs/operations.md` (task 15). Then set `SECURITY_TRUSTED_IP_HEADER=CF-Connecting-IP`, but only if the origin firewall accepts Cloudflare IPs only.
- [ ] **Coolify**: mount the persistent volume at `/app/data`. The image cache now lives there too.
- [ ] **Measure**: run PageSpeed Insights (mobile) on `/`, one `/produit/…` and one `/l/…`. The target is LCP < 2.5 s. Record the results in `docs/release-verification.md`.
- [ ] **Live tracking check**: place one real order and confirm deduplicated Purchase events in Meta Events Manager and TikTok Events Manager (test event codes).
- [ ] **Publish the template update** to the GitHub template repo (`aammo1/cod-crm-starter`) when satisfied.

---

> These tasks are also referenced in context within the relevant task files.
