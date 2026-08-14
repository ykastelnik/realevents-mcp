#!/usr/bin/env node
// Security gate for CI.
//
// `npm audit --audit-level=moderate` on the full tree fails on dev-only tooling
// (vitest, vite, postcss) that never ships: the package publishes `dist/` plus the
// README and LICENSE, so a vulnerability in the test runner cannot reach a user.
// Auditing everything meant the gate was red for reasons nobody could act on, and a
// permanently red gate gets ignored - which is worse than a narrower honest one.
//
// So this audits PRODUCTION dependencies only, fails at `high` and above, and
// allows a small set of advisories that are provably unreachable here. Every
// allowlist entry needs a reason and is re-verified on each run: if an advisory
// stops matching (fix shipped, package gone), the entry is reported as stale so it
// does not silently outlive its justification.

import { execFileSync } from "node:child_process";

// Unreachable-by-construction: this server speaks stdio only. It imports exactly
// two SDK entry points (server/mcp.js and server/stdio.js) and never loads the
// SDK's HTTP transport, so hono / @hono/node-server / ajv / express-rate-limit and
// their dependencies are present in the tree but never executed.
//
// Re-check when @modelcontextprotocol/sdk publishes a fix: drop the entry, do not
// extend it. Adding a package here because it is inconvenient, rather than because
// it is unreachable, defeats the gate.
const ALLOWED = {
  hono: "SDK HTTP transport; stdio-only server never loads it",
  "fast-uri": "via ajv, used by the SDK's HTTP schema validation; not on the stdio path",
  "ip-address": "via express-rate-limit in the SDK's HTTP transport; never loaded"
};

const BLOCKING = new Set(["high", "critical"]);

function audit() {
  try {
    // npm audit exits non-zero when it finds anything, so capture rather than throw.
    return execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8" });
  } catch (err) {
    if (typeof err.stdout === "string" && err.stdout.length > 0) return err.stdout;
    throw err;
  }
}

const report = JSON.parse(audit());
const found = Object.entries(report.vulnerabilities ?? {});

const blocking = [];
const allowed = [];

for (const [name, vuln] of found) {
  if (!BLOCKING.has(vuln.severity)) continue;
  if (Object.hasOwn(ALLOWED, name)) {
    allowed.push({ name, severity: vuln.severity });
  } else {
    blocking.push({ name, severity: vuln.severity, fix: vuln.fixAvailable });
  }
}

// A stale entry means the allowlist is drifting away from reality. Report it rather
// than letting an obsolete justification sit there indefinitely.
const seen = new Set(found.map(([name]) => name));
const stale = Object.keys(ALLOWED).filter((name) => !seen.has(name));

for (const { name, severity } of allowed) {
  console.log(`allowed  ${severity.padEnd(8)} ${name} - ${ALLOWED[name]}`);
}
if (stale.length > 0) {
  console.log("");
  console.log(`NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} no longer reported by npm audit:`);
  for (const name of stale) console.log(`  - ${name} (${ALLOWED[name]})`);
  console.log("Remove them from scripts/audit-check.mjs so the list stays honest.");
}

if (blocking.length > 0) {
  console.error("");
  console.error(`FAIL: ${blocking.length} unallowed high/critical vulnerability in production dependencies:`);
  for (const { name, severity, fix } of blocking) {
    console.error(`  ${severity.padEnd(8)} ${name} (fix available: ${fix})`);
  }
  console.error("");
  console.error("Fix it, or - only if it is provably unreachable - add it to ALLOWED");
  console.error("in scripts/audit-check.mjs with the reason.");
  process.exit(1);
}

console.log("");
console.log(`OK: no unallowed high/critical vulnerabilities in production dependencies (${allowed.length} allowed).`);
