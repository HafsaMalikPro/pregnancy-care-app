import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Owner scoping, enforced at test time (docs/SECURITY_CHECKLIST.md, B2).
 *
 * Every Prisma call on an owner model (any model with both `userId` and `anonymousSessionId`,
 * read from schema.prisma, so new owner tables are covered automatically) must either show
 * owner scoping in its arguments (`ownerWhere(…)`, `userId`, `anonymousSessionId`, or a
 * `where` variable built from them) or carry a reviewed exception:
 *
 *   // owner-scope: <why this is safe>     within the 3 lines above the call
 *   // owner-scope-file: <why>             anywhere in the file (system jobs only)
 *
 * The usual safe exception is "update by the id of a row just found with ownerWhere".
 */
const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OPS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
];
const SCOPED =
  /ownerWhere\(|\buserId\b|\banonymousSessionId\b|\bwhere\s*[,}]|where: \{\s*\.\.\.where\b|\.\.\.(owned|from)\b|\bwhere: (owned|from)\b/;

function ownerModels(): string[] {
  const schema = readFileSync(join(API_ROOT, 'prisma/schema.prisma'), 'utf8');
  return [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
    .filter(
      ([, , body]) =>
        /^\s+userId\s/m.test(body) && /^\s+anonymousSessionId\s/m.test(body),
    )
    .map(([, name]) => name[0].toLowerCase() + name.slice(1));
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === 'generated' ? [] : sources(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The text between the call's parentheses. */
function argumentsAt(text: string, start: number): string {
  let depth = 1;
  let i = start;
  while (depth > 0 && i < text.length) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    i++;
  }
  return text.slice(start, i - 1);
}

export function unscopedCalls(models = ownerModels()): string[] {
  const call = new RegExp(
    `\\.(${models.join('|')})\\.(${OPS.join('|')})\\(`,
    'g',
  );
  const found: string[] = [];
  for (const file of sources(join(API_ROOT, 'src'))) {
    const text = readFileSync(file, 'utf8');
    if (text.includes('owner-scope-file:')) continue;
    for (const m of text.matchAll(call)) {
      const args = argumentsAt(text, m.index + m[0].length);
      const before = text.slice(0, m.index).split('\n').slice(-4).join('\n');
      if (SCOPED.test(args) || before.includes('owner-scope:')) continue;
      const line = text.slice(0, m.index).split('\n').length;
      found.push(`${relative(API_ROOT, file)}:${line} ${m[1]}.${m[2]}`);
    }
  }
  return found;
}

describe('owner scoping', () => {
  it('finds the owner models in the schema', () => {
    const models = ownerModels();
    expect(models).toEqual(
      expect.arrayContaining([
        'dailyLog',
        'pregnancy',
        'appointment',
        'weightEntry',
      ]),
    );
    expect(models.length).toBeGreaterThanOrEqual(17);
  });

  it('every query on an owner model is scoped or carries a reviewed exception', () => {
    expect(unscopedCalls()).toEqual([]);
  });
});
