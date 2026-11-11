// Dependency gate for CI: fails on any high or critical advisory (production and development
// dependencies) unless it is listed in security/audit-exceptions.json with a reason and an
// expiry date that has not passed. Prints advisory ids and packages only.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_DAYS = 90;
const { exceptions } = JSON.parse(
  readFileSync(new URL('../security/audit-exceptions.json', import.meta.url), 'utf8'),
);
const today = new Date().toISOString().slice(0, 10);
const problems = [];
for (const e of exceptions) {
  if (!e.ghsa || !e.package || !e.reason || !e.reviewedBy || !e.expires) {
    problems.push(`exception ${e.ghsa ?? '?'} is missing ghsa/package/reason/reviewedBy/expires`);
  } else if (e.expires < today) {
    problems.push(`exception ${e.ghsa} (${e.package}) expired on ${e.expires}`);
  } else if ((new Date(e.expires) - new Date(today)) / 86_400_000 > MAX_DAYS) {
    problems.push(`exception ${e.ghsa} expires more than ${MAX_DAYS} days ahead`);
  }
}
const allowed = new Set(exceptions.filter((e) => e.expires >= today).map((e) => e.ghsa));

let raw;
try {
  raw = execFileSync('pnpm', ['audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  // pnpm audit exits non-zero when it finds anything; the JSON is still on stdout.
  raw = err.stdout;
  if (!raw) throw err;
}
const advisories = Object.values(JSON.parse(raw).advisories ?? {});
const blocking = advisories.filter(
  (a) => ['high', 'critical'].includes(a.severity) && !allowed.has(a.github_advisory_id),
);
for (const a of blocking) {
  problems.push(
    `${a.severity} ${a.github_advisory_id} in ${a.module_name} ${a.vulnerable_versions} (fixed: ${a.patched_versions})`,
  );
}
const counts = advisories.reduce((m, a) => ({ ...m, [a.severity]: (m[a.severity] ?? 0) + 1 }), {});
console.log(`Advisories: ${JSON.stringify(counts)}; exceptions in use: ${allowed.size}`);
if (problems.length) {
  console.error(`Dependency gate failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Dependency gate passed: no unreviewed high or critical advisories.');
