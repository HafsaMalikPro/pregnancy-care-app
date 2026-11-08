import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_KEYS } from './env.js';

/**
 * .env.example must list every variable the code reads, so a fresh `cp .env.example .env`
 * shows everything that can be configured. Sources: the boot schema (env.ts) plus every
 * `process.env.X`, `env.X` (an env object passed around) and `env('X')` (prisma config) in the
 * API's source, scripts, Prisma files and test harness.
 */
const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCAN = ['src', 'scripts', 'prisma', 'test', 'prisma.config.ts'];
const SKIP_DIRS = new Set(['generated', 'node_modules', 'dist', 'coverage']);
const READS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
  /\benv\.([A-Z][A-Z0-9_]+)\b/g,
  /\benv\(['"]([A-Z][A-Z0-9_]*)['"]\)/g,
];

function files(path: string): string[] {
  if (statSync(path).isFile())
    return /\.(ts|mts|mjs|js)$/.test(path) ? [path] : [];
  return readdirSync(path)
    .filter((name) => !SKIP_DIRS.has(name))
    .flatMap((name) => files(join(path, name)));
}

function readByCode(): Map<string, string> {
  const found = new Map<string, string>(
    ENV_KEYS.map((k) => [k, 'src/config/env.ts']),
  );
  for (const file of SCAN.flatMap((p) => files(join(API_ROOT, p)))) {
    // This file names variables only inside its own regexes.
    if (file === fileURLToPath(import.meta.url)) continue;
    const text = readFileSync(file, 'utf8');
    for (const re of READS) {
      for (const match of text.matchAll(re)) {
        if (!found.has(match[1])) found.set(match[1], relative(API_ROOT, file));
      }
    }
  }
  return found;
}

/** Names in .env.example, whether set (`X=`) or documented but commented out (`# X=`). */
function documented(): Set<string> {
  const text = readFileSync(join(API_ROOT, '.env.example'), 'utf8');
  return new Set(
    [...text.matchAll(/^#?\s?([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]),
  );
}

describe('.env.example', () => {
  it('lists every variable the code reads', () => {
    const listed = documented();
    const missing = [...readByCode()]
      .filter(([name]) => !listed.has(name))
      .map(([name, where]) => `${name} (read in ${where})`);
    expect(missing).toEqual([]);
  });

  it('lists only variables the code reads', () => {
    const read = readByCode();
    expect([...documented()].filter((name) => !read.has(name))).toEqual([]);
  });

  it('contains no secret values', () => {
    const text = readFileSync(join(API_ROOT, '.env.example'), 'utf8');
    for (const key of ['BETTER_AUTH_SECRET', 'RESEND_API_KEY']) {
      expect(text).toMatch(new RegExp(`^${key}=$`, 'm'));
    }
    // No long random-looking tokens anywhere: 32+ base64/hex characters in a row that mix
    // letters and digits (section dividers and prose don't).
    // Variable names (UPPER_SNAKE) are removed first: a long name next to a number is not a
    // secret.
    const scrubbed = text.replace(/\b[A-Z][A-Z0-9_]{2,}\b=?/g, ' ');
    const tokens = scrubbed.match(/[A-Za-z0-9+/=_]{32,}/g) ?? [];
    expect(tokens.filter((t) => /[0-9]/.test(t) && /[A-Za-z]/.test(t))).toEqual(
      [],
    );
  });
});
