import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SQL injection (docs/SECURITY_CHECKLIST.md, C5): raw SQL only through Prisma's tagged
 * templates ($queryRaw`…`, $executeRaw`…`), which send values as bind parameters. The unsafe
 * string forms and Prisma.raw() are forbidden anywhere in the API, scripts and seeds.
 */
const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FORBIDDEN =
  /\$(?:queryRawUnsafe|executeRawUnsafe)\b|\bPrisma\.raw\s*\(|\$(?:queryRaw|executeRaw)\s*\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return ['generated', 'node_modules', 'dist'].includes(name)
        ? []
        : files(path);
    }
    return /\.(ts|mjs|js)$/.test(name) && !name.endsWith('raw-sql.spec.ts')
      ? [path]
      : [];
  });
}

describe('raw SQL', () => {
  it('uses only parameterised tagged templates', () => {
    const offenders = ['src', 'scripts', 'prisma', 'test']
      .flatMap((d) => files(join(API_ROOT, d)))
      .filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')))
      .map((f) => relative(API_ROOT, f));
    expect(offenders).toEqual([]);
  });
});
