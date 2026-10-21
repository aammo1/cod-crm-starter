# Task 21: Publish the public GitHub template repository

## Status
pending

## Wave
9

## Description

Publish the verified independent CRM starter at the owner-approved public destination **`aammo1/cod-crm-starter`** and enable GitHub's template flag. This task has explicit authorization to create the repository, commit the new starter and push it. Target workspace is `/home/tal7a/Projects/cod-crm-starter`; never push this to Zehri's repository.

## Dependencies

**Depends on:** task-20-release-integration.md
**Blocks:** None

**Context from dependencies:** Target has independent Git history, complete generic CRM/API/client/docs, required passing release checks and factual release report. No source secrets/data/history should be present. GitHub user `aammo1` was authenticated during planning but must be checked again. Owner explicitly changed visibility from private to public.

## Files to Create

- No application files required; initial commit and GitHub repository/template metadata are deliverables.

## Files to Modify

- Documentation links only if they differ from actual final repository URL; rerun affected checks if code changes.

## Technical Details

1. Workdir must explicitly be target. Inspect `git status`, `git diff`, `git diff --cached`, `git remote -v`, current branch and `git log --oneline -10` (unborn history may legitimately be absent). Recheck `gh --version`, `gh auth status`, `gh api user --jq .login`. If account/permissions differ, report and resolve rather than selecting an unapproved owner.
2. Check `gh repo view aammo1/cod-crm-starter --json nameWithOwner,url,visibility,isTemplate` first. If unrelated repository exists, stop for owner decision; no overwrite/delete/force push or silent rename. Distinguish API/auth/network failures from confirmed not-found. Target `origin` must not be Zehri's remote.
3. Inspect intended tracked files and generated/ignored state. Public release contains source/example config only, no real env, DB/backups/private images/customer data/source history. Stage only intended starter files; do not use an indiscriminate source-tree commit. Create concise initial commit following target style if any (e.g. `feat: initialize standalone COD CRM starter`). No `git config` modifications, skipped hooks or amend. If identity missing, ask owner to configure it.
4. With approved destination absent, `gh repo create aammo1/cod-crm-starter --public --source . --remote origin --push` (or equivalent explicit gh create + regular push) from target. Then `gh repo edit aammo1/cod-crm-starter --template`. Never force-push; don't create a PR against the separate Zehri application. Initial template publication is a new repository rather than a feature PR.
5. Verify `gh repo view aammo1/cod-crm-starter --json url,visibility,isTemplate,defaultBranchRef`; ensure PUBLIC and template true, compare pushed commit with local, clean intended status and complete README/Use-this-template guidance. If possible inspect repository tree through gh to ensure only intended release files appear.
6. Return actual repository URL, initial commit/check summary and how to use **Use this template**. Explain per-store independent deployment/database and deliberate future upgrades. If auth/remote operation fails, report exact blocker and preserve local work, no false publish claim.

## Acceptance Criteria

- [ ] `https://github.com/aammo1/cod-crm-starter` is PUBLIC with `isTemplate: true`.
- [ ] Initial verified starter commit pushed to correct independent repository; source Zehri remote/history unchanged.
- [ ] No private runtime data or credentials in public tree/history.
- [ ] Owner receives real URL and clear template reuse instructions.

## Notes

Use appropriate commit/publishing skill guidance when executing, adapting PR-specific instructions to this explicitly requested new-repository publication. Do not publish before the release integration gate passes.
