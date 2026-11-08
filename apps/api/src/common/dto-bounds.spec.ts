import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getMetadataStorage } from 'class-validator';

/**
 * Input bounds (docs/SECURITY_CHECKLIST.md, C1): every validated string has a length bound
 * (MaxLength, or a format that implies one: enum, UUID, date, pattern, email, URL) and every
 * validated array has ArrayMaxSize. Request bodies are also capped at 100 kB (setupApp).
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));
const BOUNDED = new Set(
  [
    'maxLength',
    'isLength',
    'isEnum',
    'isIn',
    'isUUID',
    'matches',
    'isISO8601',
    'isDateString',
    'isEmail',
    'isUrl',
    'isTimeZone',
    'isLocale',
    'isCalendarDate',
  ].map((n) => n.toLowerCase()),
);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === 'generated' ? [] : sources(path);
    return /\.(dto|controller)\.ts$/.test(name) ? [path] : [];
  });
}

describe('DTO bounds', () => {
  it('every string field has a length bound and every array a size bound', async () => {
    for (const file of sources(SRC)) await import(pathToFileURL(file).href);
    const props = new Map<string, Set<string>>();
    const storage = getMetadataStorage() as unknown as {
      validationMetadatas: Map<
        unknown,
        {
          target: { name: string };
          propertyName: string;
          name?: string;
          type: string;
        }[]
      >;
    };
    for (const list of storage.validationMetadatas.values()) {
      for (const m of list) {
        const key = `${m.target.name}.${m.propertyName}`;
        if (!props.has(key)) props.set(key, new Set());
        props.get(key)!.add(String(m.name ?? m.type).toLowerCase());
      }
    }
    expect(props.size).toBeGreaterThan(200);
    const unbounded: string[] = [];
    for (const [key, names] of props) {
      if (names.has('isstring') && ![...names].some((n) => BOUNDED.has(n))) {
        unbounded.push(`${key}: string without a length bound`);
      }
      if (names.has('isarray') && !names.has('arraymaxsize')) {
        unbounded.push(`${key}: array without ArrayMaxSize`);
      }
    }
    expect(unbounded).toEqual([]);
  });
});
