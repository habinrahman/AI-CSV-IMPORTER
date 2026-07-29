/**
 * Production dependency audit for CI.
 *
 * - backend + shared: zero high/critical vulnerabilities required
 * - frontend: allows advisories limited to Next.js-bundled postcss/sharp
 *   (no npm override available until the Next.js release line updates pins)
 */
import { execSync } from "node:child_process";

const FRONTEND_NEXTJS_TRANSITIVE = new Set(["next", "postcss", "sharp"]);

function auditJson(workspace) {
  try {
    const out = execSync(`npm audit --omit=dev --audit-level=high --workspace ${workspace} --json`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return JSON.parse(out);
  } catch (err) {
    const stdout = err.stdout?.toString?.() ?? "";
    if (stdout) return JSON.parse(stdout);
    throw err;
  }
}

function highOrCriticalCount(report) {
  const v = report.metadata?.vulnerabilities ?? {};
  return (v.high ?? 0) + (v.critical ?? 0);
}

function assertClean(workspace) {
  const report = auditJson(workspace);
  const count = highOrCriticalCount(report);
  if (count === 0) return;

  console.error(`::error::${workspace} has ${count} high/critical production vulnerabilities`);
  process.exit(1);
}

function isAllowedFrontendVuln(vuln) {
  if (!FRONTEND_NEXTJS_TRANSITIVE.has(vuln.name)) return false;

  if (vuln.name === "postcss") {
    return vuln.nodes?.some((n) => n.includes("next/node_modules/postcss")) ?? false;
  }

  if (vuln.name === "sharp") {
    return vuln.effects?.includes("next") ?? false;
  }

  // next — only when its own chain is postcss/sharp
  const via = vuln.via ?? [];
  return via.every((v) => typeof v === "string" && FRONTEND_NEXTJS_TRANSITIVE.has(v));
}

function assertFrontendAllowlisted() {
  const report = auditJson("frontend");
  const count = highOrCriticalCount(report);
  if (count === 0) return;

  const vulns = Object.values(report.vulnerabilities ?? {});
  const blocking = vulns.filter((v) => !isAllowedFrontendVuln(v));

  if (blocking.length > 0) {
    console.error("::error::frontend has unallowlisted high/critical advisories:");
    for (const v of blocking) console.error(`  - ${v.name} (${v.severity})`);
    process.exit(1);
  }

  console.warn(
    `::warning::frontend: ${count} high advisory(ies) from Next.js bundled postcss/sharp (Dependabot monitors)`,
  );
}

for (const ws of ["backend", "shared"]) assertClean(ws);
assertFrontendAllowlisted();
