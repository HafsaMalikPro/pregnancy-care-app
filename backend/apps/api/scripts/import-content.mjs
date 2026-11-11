// Imports clinical content files as DRAFTS through the same audited workflow editors use.
// Nothing is reviewed or published here: every draft still needs submit → clinical review →
// publish in the admin API. Run `pnpm build` first.
//
//   node scripts/import-content.mjs --author editor@example.org ../../content/drafts
//
// Each *.json file holds one item; see content/README.md for the format. Files with
// unfilled template placeholders ("<…>" or "TODO") are refused.
import 'dotenv/config';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { AdminContentService } from '../dist/admin/admin-content.service.js';
import { PrismaService } from '../dist/database/prisma.service.js';

const args = process.argv.slice(2);
const authorIndex = args.indexOf('--author');
const author = authorIndex >= 0 ? args[authorIndex + 1] : undefined;
const dir = args.filter(
  (_, i) => i !== authorIndex && i !== authorIndex + 1,
)[0];
if (!author || !dir) {
  console.error(
    'Usage: node scripts/import-content.mjs --author <content editor email> <directory>',
  );
  process.exit(2);
}

function* files(path) {
  for (const name of readdirSync(path).sort()) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (name.endsWith('.json')) yield full;
  }
}

function hasPlaceholder(value) {
  if (typeof value === 'string')
    return /^<.*>$/s.test(value.trim()) || /\bTODO\b/.test(value);
  if (Array.isArray(value)) return value.some(hasPlaceholder);
  if (value && typeof value === 'object')
    return Object.values(value).some(hasPlaceholder);
  return false;
}

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error'],
});
const prisma = app.get(PrismaService);
const content = app.get(AdminContentService);
const user = await prisma.user.findUnique({ where: { email: author } });
if (
  !user ||
  !['content_editor', 'administrator'].includes(user.staffRole ?? '')
) {
  console.error(`${author} must be a content_editor or administrator.`);
  await app.close();
  process.exit(2);
}
const actor = { ...user, staffRole: user.staffRole };

const result = { created: 0, skipped: 0, invalid: 0 };
for (const file of files(dir)) {
  const item = JSON.parse(readFileSync(file, 'utf8'));
  if (hasPlaceholder(item)) {
    console.log(`invalid  ${file}: still contains template placeholders`);
    result.invalid++;
    continue;
  }
  const { kind, ...fields } = item;
  try {
    if (kind === 'week_guide') {
      await content.createWeekGuideDraft(actor, fields, 'import');
    } else {
      await content.createDraft(
        actor,
        {
          kind,
          body: '',
          premium: false,
          tags: [],
          trimester: null,
          ...fields,
        },
        'import',
      );
    }
    console.log(`draft    ${file}`);
    result.created++;
  } catch (error) {
    const status = error?.status ?? error?.getStatus?.();
    if (status === 409) {
      console.log(`skipped  ${file}: a working version already exists`);
      result.skipped++;
    } else {
      const message =
        error?.response?.message ?? error?.message ?? String(error);
      console.log(
        `invalid  ${file}: ${Array.isArray(message) ? message.join('; ') : message}`,
      );
      result.invalid++;
    }
  }
}
console.log(
  `\n${result.created} drafts created, ${result.skipped} skipped, ${result.invalid} invalid. Nothing was published.`,
);
await app.close();
process.exit(result.invalid ? 1 : 0);
