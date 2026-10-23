import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { auditReleaseTree, root } from "./release-tree.mjs";

test("intended public tree installs offline and builds without private assets or a database", { timeout: 300_000 }, () => {
  const files = auditReleaseTree();
  const temp = mkdtempSync(path.join(os.tmpdir(), "crm-fresh-install-"));
  const app = path.join(temp, "app");
  mkdirSync(app);
  try {
    for (const file of files) {
      mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
      cpSync(path.join(root, file), path.join(app, file));
    }
    const dbDir = path.join(temp, "must-not-exist");
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      DELIVERY_PROVIDER: "mock", DB_PATH: path.join(dbDir, "crm.db"), UPLOAD_DIR: path.join(dbDir, "uploads"),
      NODE_OPTIONS: `--import=${path.join(app, "scripts/block-external-network.mjs")}` };
    execFileSync("npm", ["ci", "--offline", "--ignore-scripts", "--include=dev", "--no-audit", "--no-fund"], { cwd: app, env, stdio: "inherit", timeout: 120_000 });
    execFileSync(process.execPath, ["-e", "const db=require('better-sqlite3')(':memory:');db.exec('SELECT 1');db.close();require('sharp');"], { cwd: app, env });
    execFileSync("npm", ["run", "build"], { cwd: app, env, stdio: "inherit", timeout: 240_000 });
    assert.equal(existsSync(dbDir), false, "Fresh build must never open SQLite/media");
    assert.ok(existsSync(path.join(app, ".next/standalone/server.js")));
    console.log("Fresh allowlisted copy: offline npm ci, host native SQLite/sharp, standalone build, zero build-time DB/media and no copied Git history verified.");
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
